#!/usr/bin/env node
import { confirm, input, select } from '@inquirer/prompts'
import crypto from 'node:crypto'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

type InstallMode = 'managed-simple' | 'existing-infra'
type CommandMode = 'install' | 'update' | 'doctor'

type ParsedEnv = {
  mode: InstallMode
  appUrl: string
  apiImage: string
  webImage: string
  imageTag: string
  superadminEmail: string
  postgresUser: string
  postgresDb: string
}

type SchemaDriftState = {
  projectTableExists: boolean
  taskTableExists: boolean
  missingProjectTaskCounter: boolean
  missingTaskNumber: boolean
  missingTaskProjectNumberIndex: boolean
  missingProjectDependencyTable: boolean
  missingTaskDependencyTable: boolean
}

type CliOptions = {
  command: CommandMode
  dir?: string
  version?: string
  yes: boolean
  mode?: InstallMode
  domain?: string
  workspace?: string
  superadminEmail?: string
  superadminName?: string
  acmeEmail?: string
  emailSetup?: 'now' | 'later'
  smtpHost?: string
  smtpPort?: string
  smtpUser?: string
  smtpPassword?: string
  mailFrom?: string
}

const color = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  brightYellow: '\x1b[93m',
  brightGreen: '\x1b[92m',
  red: '\x1b[31m',
}

function paint(text: string, tone: string) {
  return `${tone}${text}${color.reset}`
}

function section(title: string) {
  console.log(`\n${paint(title, color.brightYellow)}`)
}

function banner(mode: CommandMode) {
  const label = mode === 'install' ? 'I N S T A L L E R' : mode === 'update' ? 'U P D A T E R' : 'D O C T O R'
  console.log(paint(`S A L L Y  :::::::  ${label}`, color.brightGreen))
  console.log(paint(`clean ${mode} flow for sally_`, color.dim))
}

function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function normalizeDomain(value: string) {
  return value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function baseUrlFromDomain(domain: string) {
  return `https://${normalizeDomain(domain)}`
}

function slugifyWorkspaceName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'workspace'
}

function smtpUrlFromParts(host: string, port: string, user: string, password: string) {
  const scheme = String(port).trim() === '465' ? 'smtps' : 'smtp'
  return `${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`
}

function composeForManagedSimple() {
  return `services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_USER: ${'${POSTGRES_USER}'}
      POSTGRES_PASSWORD: ${'${POSTGRES_PASSWORD}'}
      POSTGRES_DB: ${'${POSTGRES_DB}'}
    volumes:
      - sally-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 2s
      timeout: 5s
      retries: 20

  api:
    image: ${'${SALLY_API_IMAGE}'}
    restart: unless-stopped
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy

  web:
    image: ${'${SALLY_WEB_IMAGE}'}
    restart: unless-stopped
    env_file: .env
    depends_on:
      - api

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    env_file: .env
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - web
      - api

volumes:
  sally-postgres:
  caddy-data:
  caddy-config:
`
}

function composeForExistingInfra() {
  return `services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env
    environment:
      POSTGRES_USER: ${'${POSTGRES_USER}'}
      POSTGRES_PASSWORD: ${'${POSTGRES_PASSWORD}'}
      POSTGRES_DB: ${'${POSTGRES_DB}'}
    volumes:
      - sally-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 2s
      timeout: 5s
      retries: 20

  api:
    image: ${'${SALLY_API_IMAGE}'}
    restart: unless-stopped
    env_file: .env
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy

  web:
    image: ${'${SALLY_WEB_IMAGE}'}
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  sally-postgres:
`
}

function caddyfile(domain: string) {
  return `{
  email {$CADDY_ACME_EMAIL}
}

${normalizeDomain(domain)} {
  encode gzip zstd

  handle_path /api/* {
    reverse_proxy api:4000
  }

  reverse_proxy web:3000
}
`
}

function envFile(args: {
  mode: InstallMode
  domain: string
  appUrl: string
  imageTag: string
  workspaceName: string
  workspaceSlug: string
  superadminEmail: string
  superadminName: string
  smtpConfigured: boolean
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPassword: string
  mailFrom: string
  caddyAcmeEmail?: string
  postgresPassword: string
  sessionSecret: string
  appEncryptionKey: string
  bootstrapPassword: string
}) {
  const dbName = 'sally'
  const dbUser = 'postgres'
  const databaseUrl = `postgresql://${dbUser}:${args.postgresPassword}@postgres:5432/${dbName}?schema=public`
  const smtpUrl = smtpUrlFromParts(args.smtpHost, args.smtpPort, args.smtpUser, args.smtpPassword)
  return `# generated by create-sally
SALLY_INSTALL_MODE=${args.mode}
SALLY_URL=${args.appUrl}
APP_BASE_URL=${args.appUrl}
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_WORKSPACE_SLUG=${args.workspaceSlug}
SALLY_WORKSPACE_NAME=${args.workspaceName}
SALLY_WORKSPACE_SLUG=${args.workspaceSlug}

SALLY_IMAGE_REGISTRY=ghcr.io/use-sally
SALLY_IMAGE_TAG=${args.imageTag}
SALLY_API_IMAGE=ghcr.io/use-sally/sally-api:${args.imageTag}
SALLY_WEB_IMAGE=ghcr.io/use-sally/sally-web:${args.imageTag}

POSTGRES_USER=${dbUser}
POSTGRES_PASSWORD=${args.postgresPassword}
POSTGRES_DB=${dbName}
DATABASE_URL=${databaseUrl}

SESSION_SECRET=${args.sessionSecret}
APP_ENCRYPTION_KEY=${args.appEncryptionKey}

SUPERADMIN_EMAIL=${args.superadminEmail}
SUPERADMIN_NAME=${args.superadminName}
BOOTSTRAP_SUPERADMIN_PASSWORD=${args.bootstrapPassword}

SMTP_HOST=${args.smtpHost}
SMTP_PORT=${args.smtpPort}
SMTP_USER=${args.smtpUser}
SMTP_PASSWORD=${args.smtpPassword}
SMTP_URL=${smtpUrl}
MAIL_FROM=${args.mailFrom}
CADDY_ACME_EMAIL=${args.caddyAcmeEmail ?? ''}

# email setup status from installer
SMTP_CONFIGURED=${args.smtpConfigured ? 'true' : 'false'}
`
}

function setupNotes(mode: InstallMode, bootstrapPassword: string, targetDir: string, appUrl: string, smtpConfigured: boolean) {
  const emailNotes = smtpConfigured
    ? 'Email is configured in .env.\n'
    : `Email setup is still required for invites, password resets, and notifications.\nUpdate SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM in .env, then run docker compose up -d.\n`

  if (mode === 'managed-simple') {
    return `Sally instance files:\n- ${targetDir}\n\nManaged-simple files:\n- docker-compose.yml\n- Caddyfile\n- .env\n\nLogin URL:\n- ${appUrl}\n\nSuperadmin password:\n- ${bootstrapPassword}\n\n${emailNotes}`
  }

  return `Sally instance files:\n- ${targetDir}\n\nExisting-infra files:\n- docker-compose.yml\n- .env\n\nPublic app URL after your reverse proxy / TLS is configured:\n- ${appUrl}\n\nSuperadmin password:\n- ${bootstrapPassword}\n\n${emailNotes}`
}

async function runCommand(command: string, args: string[], cwd: string, options?: { quiet?: boolean }) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: options?.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: false })
    let stderr = ''

    if (options?.quiet) {
      child.stdout?.on('data', () => {})
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk)
      })
    }

    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`))
    })
    child.on('error', reject)
  })
}

async function runCommandCapture(command: string, args: string[], cwd?: string) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`))
    })
    child.on('error', reject)
  })
}

async function detectServerIpv4() {
  const candidates = [
    ['dig', ['+short', 'myip.opendns.com', '@resolver1.opendns.com']],
    ['sh', ['-lc', 'curl -4fsSL https://api.ipify.org || curl -4fsSL https://ifconfig.me']],
  ] as const

  for (const [command, args] of candidates) {
    try {
      const output = (await runCommandCapture(command, Array.from(args))).trim().split(/\s+/).find(Boolean)
      if (output && /^\d+\.\d+\.\d+\.\d+$/.test(output)) return output
    } catch {}
  }

  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }

  throw new Error('Could not determine the server public IPv4 address for DNS verification.')
}

async function resolveDomainIpv4(domain: string) {
  try {
    const output = await runCommandCapture('dig', ['+short', normalizeDomain(domain), 'A'])
    return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+\.\d+\.\d+\.\d+$/.test(line))
  } catch {
    return []
  }
}

async function verifyManagedDomainPointsHere(domain: string) {
  const serverIp = await detectServerIpv4()
  const resolvedIps = await resolveDomainIpv4(domain)

  if (resolvedIps.length === 0) {
    throw new Error(`Domain check failed: ${domain} does not currently resolve to an A record. Point it to ${serverIp} and run the installer again.`)
  }

  if (!resolvedIps.includes(serverIp)) {
    throw new Error(`Domain check failed: ${domain} resolves to ${resolvedIps.join(', ')}, but this server is ${serverIp}. Point the domain to this server first, then rerun the installer.`)
  }

  console.log(paint(`DNS OK  ${domain} -> ${serverIp}`, color.green))
}

function printWelcome(mode: InstallMode, appUrl: string, superadminEmail: string, bootstrapPassword: string) {
  console.log('')
  console.log(paint('W E L C O M E  :::::::  T O  :::::::  S A L L Y', color.brightGreen))
  if (mode === 'managed-simple') {
    console.log(`${paint('URL', color.brightYellow)}: ${appUrl}`)
  } else {
    console.log(`${paint('URL', color.brightYellow)}: ${appUrl} ${paint('(after your reverse proxy / TLS is configured)', color.dim)}`)
    console.log(`${paint('LOCAL', color.brightYellow)}: http://127.0.0.1:3000`)
    console.log(`${paint('API', color.brightYellow)}: http://127.0.0.1:4000`)
  }
  console.log(`${paint('USER', color.brightYellow)}: ${superadminEmail}`)
  console.log(`${paint('PASSWORD', color.brightYellow)}: ${bootstrapPassword}`)
}

function printUpdateSuccess(mode: InstallMode, appUrl: string, imageTag: string) {
  console.log('')
  console.log(paint('S A L L Y  :::::::  U P D A T E D', color.brightGreen))
  console.log(`${paint('VERSION', color.brightYellow)}: ${imageTag}`)
  if (mode === 'managed-simple') {
    console.log(`${paint('URL', color.brightYellow)}: ${appUrl}`)
  } else {
    console.log(`${paint('URL', color.brightYellow)}: ${appUrl} ${paint('(external URL depends on your reverse proxy / TLS)', color.dim)}`)
    console.log(`${paint('LOCAL', color.brightYellow)}: http://127.0.0.1:3000`)
    console.log(`${paint('API', color.brightYellow)}: http://127.0.0.1:4000`)
  }
}

async function backupExistingInstance(targetDir: string, postgresUser: string, postgresDb: string) {
  const backupRoot = path.join(targetDir, '.backups')
  const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z')
  const backupDir = path.join(backupRoot, stamp)

  section('Backing up current Sally instance')
  await fs.mkdir(backupDir, { recursive: true })

  const envPath = path.join(targetDir, '.env')
  const composePath = path.join(targetDir, 'docker-compose.yml')
  await fs.copyFile(envPath, path.join(backupDir, '.env'))
  await fs.copyFile(composePath, path.join(backupDir, 'docker-compose.yml'))

  const dbDumpPath = path.join(backupDir, 'database.dump')
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(dbDumpPath)
    const child = spawn('docker', ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', postgresUser, '-d', postgresDb, '-Fc'], { cwd: targetDir, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let stderr = ''
    child.stdout.pipe(out)
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      out.close()
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `pg_dump failed with exit code ${code ?? 'unknown'}`))
    })
  })

  const uploadsArchive = path.join(backupDir, 'uploads.tgz')
  const apiContainerId = (await runCommandCapture('docker', ['compose', 'ps', '-q', 'api'], targetDir).catch(() => '')).trim()

  if (!apiContainerId) {
    await fs.writeFile(path.join(backupDir, 'uploads.txt'), 'api container not present during backup; no uploads archive captured\n')
  } else {
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(uploadsArchive)
      const child = spawn('docker', ['cp', `${apiContainerId}:/app/apps/api/uploads/.`, '-'], { cwd: targetDir, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
      let stderr = ''
      let stdoutSeen = false
      child.stdout.on('data', (chunk) => {
        stdoutSeen = true
        out.write(chunk)
      })
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk)
      })
      child.on('error', reject)
      child.on('exit', async (code) => {
        out.close()
        if (code === 0 && stdoutSeen) return resolve()
        if (code === 0 && !stdoutSeen) {
          await fs.writeFile(path.join(backupDir, 'uploads.txt'), 'api uploads directory empty or unavailable during backup\n')
          return resolve()
        }
        await fs.writeFile(path.join(backupDir, 'uploads.txt'), `uploads backup skipped: ${stderr.trim() || `docker cp failed with exit code ${code ?? 'unknown'}`}\n`)
        resolve()
      })
    })
  }

  console.log(paint(`Backup written to ${backupDir}`, color.green))
}

async function hasCommand(command: string) {
  try {
    await runCommandCapture('sh', ['-lc', `command -v ${command}`])
    return true
  } catch {
    return false
  }
}

async function dockerComposeAvailable() {
  return await new Promise<boolean>((resolve) => {
    const child = spawn('docker', ['compose', 'version'], { stdio: 'ignore', shell: false })
    child.on('exit', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

async function ensureDockerInstalled() {
  const hasDocker = await hasCommand('docker')
  const hasCompose = hasDocker ? await dockerComposeAvailable() : false

  if (hasDocker && hasCompose) {
    console.log(paint('Docker OK', color.green))
    return
  }

  if (process.platform !== 'linux') {
    throw new Error('Docker is missing and automatic installation is only supported by this installer on Linux right now.')
  }

  section('Installing Docker')
  console.log(paint('Docker or Docker Compose is missing. Sally will install Docker now.', color.yellow))
  await runCommand('sh', ['-lc', 'curl -fsSL https://get.docker.com | sh'], process.cwd())
  await runCommand('sh', ['-lc', 'systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true'], process.cwd())

  const dockerInstalled = await hasCommand('docker')
  const composeInstalled = dockerInstalled ? await dockerComposeAvailable() : false

  if (!dockerInstalled || !composeInstalled) {
    throw new Error('Docker installation did not complete successfully. Install Docker + Docker Compose manually, then rerun create-sally.')
  }

  console.log(paint('Docker installed successfully', color.green))
}

async function writeHostedMcpNotes(targetDir: string, appUrl: string) {
  const mcpDir = path.join(targetDir, 'mcp')
  await fs.mkdir(mcpDir, { recursive: true })

  section('Hosted Sally MCP')

  const setupText = `Hosted Sally MCP is now the primary path.

Sally URL:
- ${appUrl}

Next steps:
1. log into Sally
2. open Settings → API keys
3. create a Hosted MCP key
4. point your MCP client at ${appUrl}/api/mcp
5. authenticate with the Hosted MCP key as Bearer token

Local stdio sally-mcp remains available for advanced setups, but it is no longer scaffolded automatically by create-sally.
`

  await fs.writeFile(path.join(mcpDir, 'MCP_SETUP.txt'), setupText)

  console.log(paint(`Hosted Sally MCP notes written to ${mcpDir}`, color.green))
}

async function waitForHealth(url: string, label: string, attempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error(`${label} did not become healthy at ${url}`)
}

async function waitForPostgres(targetDir: string, postgresUser: string, postgresDb: string, attempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runCommand('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', postgresUser, '-d', postgresDb], targetDir)
      return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error(`Postgres did not become ready in time for database ${postgresDb}`)
}

type MigrationState = {
  hasMigrationsTable: boolean
  coreTableCount: number
  baselineApplied: boolean
}

async function inspectMigrationState(targetDir: string, postgresUser: string, postgresDb: string) {
  const stateSql = [
    'SELECT json_build_object(',
    "  'hasMigrationsTable', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations'),",
    "  'coreTableCount', (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('Workspace', 'Project', 'TaskStatus', 'Task'))",
    ');',
  ].join(' ')

  const rawState = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', stateSql],
    targetDir,
  )
  const stateLine = rawState.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => line.startsWith('{') && line.endsWith('}'))
  if (!stateLine) throw new Error(`Could not inspect migration state. Output was:\n${rawState}`)

  const state = JSON.parse(stateLine) as Omit<MigrationState, 'baselineApplied'>
  if (!state.hasMigrationsTable) {
    return { ...state, baselineApplied: false }
  }

  const baselineSql = "SELECT EXISTS (SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name = '20260410182000_init');"
  const rawBaseline = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', baselineSql],
    targetDir,
  )
  const baselineValue = rawBaseline.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop()
  if (!baselineValue) throw new Error(`Could not inspect baseline migration state. Output was:\n${rawBaseline}`)

  return { ...state, baselineApplied: baselineValue === 't' || baselineValue === 'true' }
}

async function maybeResolveBaselineMigration(targetDir: string, postgresUser: string, postgresDb: string) {
  const state = await inspectMigrationState(targetDir, postgresUser, postgresDb)

  if (state.baselineApplied) {
    console.log(paint('Baseline migration already recorded', color.green))
    return
  }

  if (state.coreTableCount === 0) {
    console.log(paint('Fresh database detected', color.green))
    return
  }

  if (state.coreTableCount < 4) {
    throw new Error(`Detected partial Sally schema (${state.coreTableCount}/4 core tables present) without a recorded baseline migration. Refusing automatic reconciliation because this looks like schema drift or an incomplete install.`)
  }

  section('Reconciling baseline migration history')
  console.log(paint('Detected an initialized Sally schema without recorded baseline migration. Marking init migration as applied before deploy.', color.yellow))
  await runCommand('docker', ['compose', 'run', '--rm', 'api', 'sh', '-lc', 'cd /app/packages/db && pnpm exec prisma migrate resolve --applied 20260410182000_init --schema prisma/schema.prisma'], targetDir)
}

type StatusRepairState = {
  blockedEnumExists: boolean
  projectsMissingBlocked: number
  legacyBlockedCount: number
}

async function inspectStatusRepairState(targetDir: string, postgresUser: string, postgresDb: string) {
  const sql = [
    'SELECT json_build_object(',
    "  'blockedEnumExists', EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'TaskStatusType' AND e.enumlabel = 'BLOCKED'),",
    `  'projectsMissingBlocked', (
         SELECT COUNT(*)::int FROM (
           SELECT p."id"
           FROM "Project" p
           WHERE NOT EXISTS (
             SELECT 1 FROM "TaskStatus" s
             WHERE s."projectId" = p."id" AND s.type::text = 'BLOCKED'
           )
         ) missing
       ),`,
    "  'legacyBlockedCount', (SELECT COUNT(*)::int FROM \"TaskStatus\" WHERE lower(name) = 'blocked' AND type::text = 'TODO')",
    ');',
  ].join(' ')

  const raw = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    targetDir,
  )
  const jsonLine = raw.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => line.startsWith('{') && line.endsWith('}'))
  if (!jsonLine) throw new Error(`Could not inspect status repair state. Output was:\n${raw}`)
  return JSON.parse(jsonLine) as StatusRepairState
}

type ProjectStatusRow = {
  id: string
  projectId: string
  name: string
  type: string
  position: number
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

async function maybeRepairBlockedStatuses(targetDir: string, postgresUser: string, postgresDb: string) {
  const state = await inspectStatusRepairState(targetDir, postgresUser, postgresDb)
  if (state.legacyBlockedCount === 0 && state.projectsMissingBlocked === 0) return

  section('Repairing blocked statuses')
  console.log(paint(`Detected ${state.legacyBlockedCount} legacy Blocked rows and ${state.projectsMissingBlocked} projects missing a proper BLOCKED status. Repairing them before migration.`, color.yellow))

  if (!state.blockedEnumExists) {
    await runCommand(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-v', 'ON_ERROR_STOP=1', '-c', `ALTER TYPE "TaskStatusType" ADD VALUE IF NOT EXISTS 'BLOCKED';`],
      targetDir,
    )
  }

  const projectsSql = [
    'SELECT json_agg(row_to_json(t)) FROM (',
    '  SELECT p."id" AS "projectId"',
    '  FROM "Project" p',
    '  WHERE NOT EXISTS (',
    '    SELECT 1 FROM "TaskStatus" s',
    `    WHERE s."projectId" = p."id" AND s.type::text = 'BLOCKED'`,
    '  )',
    ') t;',
  ].join(' ')
  const rawProjects = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', projectsSql],
    targetDir,
  )
  const projectJson = rawProjects.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() || '[]'
  const affectedProjects = ((projectJson === 'null' ? [] : JSON.parse(projectJson)) as Array<{ projectId: string }>).map((row) => row.projectId)

  for (const projectId of affectedProjects) {
    const statusSql = [
      'SELECT json_agg(row_to_json(t) ORDER BY t.position, t.id) FROM (',
      '  SELECT id, "projectId" AS "projectId", name, type::text AS type, position',
      '  FROM "TaskStatus"',
      `  WHERE "projectId" = ${sqlLiteral(projectId)}`,
      '  ORDER BY position, id',
      ') t;',
    ].join(' ')
    const rawStatuses = await runCommandCapture(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', statusSql],
      targetDir,
    )
    const statusJson = rawStatuses.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() || '[]'
    const statuses = (statusJson === 'null' ? [] : JSON.parse(statusJson)) as ProjectStatusRow[]
    if (!statuses.length) continue

    const legacyBlocked = statuses.find((s) => s.type === 'TODO' && s.name.trim().toLowerCase() === 'blocked')
    const review = statuses.find((s) => s.type === 'REVIEW')
    const done = statuses.find((s) => s.type === 'DONE')
    const customStatuses = statuses.filter((s) => !['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'].includes(s.type) && s.id !== legacyBlocked?.id)

    const sqlParts = ['BEGIN;']

    statuses
      .filter((s) => s.position >= 2)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .forEach((status, index) => {
        sqlParts.push(`UPDATE "TaskStatus" SET "position" = ${1000 + index} WHERE id = ${sqlLiteral(status.id)};`)
      })

    if (legacyBlocked) {
      sqlParts.push(
        `UPDATE "TaskStatus" SET name = 'Blocked', type = 'BLOCKED'::"TaskStatusType", "position" = 2, color = '#7f1d1d' WHERE id = ${sqlLiteral(legacyBlocked.id)};`,
      )
    } else {
      sqlParts.push(
        `INSERT INTO "TaskStatus" ("id", "projectId", "name", "type", "position", "color") VALUES ('blocked_' || substr(md5(${sqlLiteral(projectId)} || '_blocked'), 1, 24), ${sqlLiteral(projectId)}, 'Blocked', 'BLOCKED'::"TaskStatusType", 2, '#7f1d1d');`,
      )
    }

    if (review) sqlParts.push(`UPDATE "TaskStatus" SET "position" = 3 WHERE id = ${sqlLiteral(review.id)};`)
    if (done) sqlParts.push(`UPDATE "TaskStatus" SET "position" = 4 WHERE id = ${sqlLiteral(done.id)};`)

    customStatuses
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .forEach((status, index) => {
        sqlParts.push(`UPDATE "TaskStatus" SET "position" = ${5 + index} WHERE id = ${sqlLiteral(status.id)};`)
      })

    sqlParts.push('COMMIT;')

    await runCommand(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-v', 'ON_ERROR_STOP=1', '-c', sqlParts.join(' ')],
      targetDir,
    )
  }

  await runCommand(
    'docker',
    ['compose', 'run', '--rm', 'api', 'sh', '-lc', 'cd /app/packages/db && pnpm exec prisma migrate resolve --rolled-back 20260415162500_add_blocked_status --schema prisma/schema.prisma'],
    targetDir,
  )
}

async function maybeResolveFailedBlockedMigration(targetDir: string) {
  const raw = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'sally', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT COUNT(*) FROM "_prisma_migrations" WHERE migration_name = '20260415162500_add_blocked_status' AND finished_at IS NULL AND rolled_back_at IS NULL;`],
    targetDir,
  ).catch(() => '0')

  const count = Number(raw.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() || '0')
  if (!count) return

  section('Resolving failed blocked-status migration state')
  console.log(paint('Found failed 20260415162500_add_blocked_status migration record. Marking it rolled back so deploy can retry cleanly.', color.yellow))
  await runCommand(
    'docker',
    ['compose', 'run', '--rm', 'api', 'sh', '-lc', 'cd /app/packages/db && pnpm exec prisma migrate resolve --rolled-back 20260415162500_add_blocked_status --schema prisma/schema.prisma'],
    targetDir,
  )
}

async function inspectSchemaDriftState(targetDir: string, postgresUser: string, postgresDb: string) {
  const sql = [
    'SELECT json_build_object(',
    "  'projectTableExists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Project'),",
    "  'taskTableExists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Task'),",
    "  'missingProjectTaskCounter', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Project' AND column_name = 'taskCounter'),",
    "  'missingTaskNumber', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Task' AND column_name = 'number'),",
    "  'missingTaskProjectNumberIndex', NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Task' AND indexname = 'Task_projectId_number_key'),",
    "  'missingProjectDependencyTable', NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ProjectDependency'),",
    "  'missingTaskDependencyTable', NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TaskDependency')",
    ');',
  ].join(' ')

  const raw = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    targetDir,
  )
  const jsonLine = raw.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => line.startsWith('{') && line.endsWith('}'))
  if (!jsonLine) throw new Error(`Could not inspect schema drift state. Output was:\n${raw}`)
  return JSON.parse(jsonLine) as SchemaDriftState
}

async function maybeRepairInitSchemaDrift(targetDir: string, postgresUser: string, postgresDb: string) {
  const state = await inspectSchemaDriftState(targetDir, postgresUser, postgresDb)
  if (!state.projectTableExists || !state.taskTableExists) return
  if (!state.missingProjectTaskCounter && !state.missingTaskNumber && !state.missingTaskProjectNumberIndex && !state.missingProjectDependencyTable && !state.missingTaskDependencyTable) return

  section('Repairing missing init schema columns')
  console.log(paint('Detected missing legacy init-schema columns/indexes. Repairing taskCounter/task.number/project-dependency/task-dependency drift before continuing.', color.yellow))

  const sqlParts = ['BEGIN;']
  if (state.missingProjectTaskCounter) sqlParts.push('ALTER TABLE "Project" ADD COLUMN "taskCounter" INTEGER NOT NULL DEFAULT 0;')
  if (state.missingTaskNumber) sqlParts.push('ALTER TABLE "Task" ADD COLUMN "number" INTEGER;')
  if (state.missingProjectDependencyTable) {
    sqlParts.push(
      'CREATE TABLE "ProjectDependency" (',
      '  "projectId" TEXT NOT NULL,',
      '  "dependsOnId" TEXT NOT NULL,',
      '  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '  CONSTRAINT "ProjectDependency_pkey" PRIMARY KEY ("projectId","dependsOnId")',
      ');',
      'ALTER TABLE "ProjectDependency" ADD CONSTRAINT "ProjectDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
      'ALTER TABLE "ProjectDependency" ADD CONSTRAINT "ProjectDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    )
  }
  if (state.missingTaskDependencyTable) {
    sqlParts.push(
      'CREATE TABLE "TaskDependency" (',
      '  "taskId" TEXT NOT NULL,',
      '  "dependsOnId" TEXT NOT NULL,',
      '  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '  CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("taskId","dependsOnId")',
      ');',
      'ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
      'ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    )
  }
  if (state.missingTaskNumber) {
    sqlParts.push(
      'WITH ordered_tasks AS (',
      '  SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", id) AS next_number',
      '  FROM "Task"',
      '),',
      'updated_tasks AS (',
      '  UPDATE "Task" t',
      '  SET "number" = ordered_tasks.next_number',
      '  FROM ordered_tasks',
      '  WHERE t.id = ordered_tasks.id',
      '  RETURNING t."projectId", t."number"',
      ')',
      'UPDATE "Project" p',
      'SET "taskCounter" = COALESCE(project_max.max_number, 0)',
      'FROM (',
      '  SELECT "projectId", MAX("number") AS max_number',
      '  FROM "Task"',
      '  GROUP BY "projectId"',
      ') project_max',
      'WHERE p.id = project_max."projectId";',
      'UPDATE "Project" SET "taskCounter" = 0 WHERE "taskCounter" IS NULL;',
      'ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;',
    )
  } else if (state.missingProjectTaskCounter) {
    sqlParts.push(
      'UPDATE "Project" p',
      'SET "taskCounter" = COALESCE(project_max.max_number, 0)',
      'FROM (',
      '  SELECT "projectId", MAX("number") AS max_number',
      '  FROM "Task"',
      '  GROUP BY "projectId"',
      ') project_max',
      'WHERE p.id = project_max."projectId";',
      'UPDATE "Project" SET "taskCounter" = 0 WHERE "taskCounter" IS NULL;',
    )
  }
  if (state.missingTaskProjectNumberIndex) sqlParts.push('CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");')
  sqlParts.push('COMMIT;')

  await runCommand(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-v', 'ON_ERROR_STOP=1', '-c', sqlParts.join(' ')],
    targetDir,
  )
}

type TaskPeopleMigrationState = {
  taskTableExists: boolean
  missingTaskOwnerColumn: boolean
  missingTaskParticipantTable: boolean
  taskParticipantRoleEnumExists: boolean
  taskParticipantBackfillIncomplete: boolean
}

async function inspectTaskPeopleMigrationState(targetDir: string, postgresUser: string, postgresDb: string) {
  const sql = [
    'SELECT json_build_object(',
    "  'taskTableExists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Task'),",
    "  'missingTaskOwnerColumn', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Task' AND column_name = 'owner'),",
    "  'missingTaskParticipantTable', NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TaskParticipant'),",
    "  'taskParticipantRoleEnumExists', EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskParticipantRole'),",
    `  'taskParticipantBackfillIncomplete', CASE
         WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TaskParticipant') THEN false
         ELSE EXISTS (
           SELECT 1
           FROM "Task" t
           WHERE (COALESCE(NULLIF(BTRIM(t."owner"), ''), '') <> '' OR COALESCE(NULLIF(BTRIM(t."assignee"), ''), '') <> '' OR EXISTS (SELECT 1 FROM "TaskCollaborator" tc WHERE tc."taskId" = t.id))
             AND NOT EXISTS (SELECT 1 FROM "TaskParticipant" tp WHERE tp."taskId" = t.id)
         )
       END`,
    ');',
  ].join(' ')

  const raw = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    targetDir,
  )
  const jsonLine = raw.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => line.startsWith('{') && line.endsWith('}'))
  if (!jsonLine) throw new Error(`Could not inspect task owner/participants migration state. Output was:\n${raw}`)
  return JSON.parse(jsonLine) as TaskPeopleMigrationState
}

async function maybeRepairTaskPeopleMigrationState(targetDir: string, postgresUser: string, postgresDb: string) {
  const state = await inspectTaskPeopleMigrationState(targetDir, postgresUser, postgresDb)
  if (!state.taskTableExists) return
  if (state.missingTaskOwnerColumn && state.missingTaskParticipantTable) return

  if (state.missingTaskOwnerColumn || state.missingTaskParticipantTable || !state.taskParticipantRoleEnumExists) {
    throw new Error('Detected ambiguous task owner/participants schema drift. Refusing automatic reconciliation because the database is only partially through the owner/participants rollout.')
  }

  if (!state.taskParticipantBackfillIncomplete) return

  section('Repairing task owner/participants migration state')
  console.log(paint('Detected task owner/participants schema drift. Repairing canonical task people data before migration deploy.', color.yellow))

  const sqlParts = [
    'BEGIN;',
    'UPDATE "Task" SET "owner" = NULLIF(BTRIM("assignee"), \'\') WHERE COALESCE(NULLIF(BTRIM("owner"), \'\'), \'\') = \'\' AND COALESCE(NULLIF(BTRIM("assignee"), \'\'), \'\') <> \'\';',
    'INSERT INTO "TaskParticipant" ("taskId", "participant", "role", "position")',
    'SELECT t.id, t."owner", \'OWNER\'::"TaskParticipantRole", 0',
    'FROM "Task" t',
    'WHERE COALESCE(NULLIF(BTRIM(t."owner"), \'\'), \'\') <> \'\'',
    '  AND NOT EXISTS (SELECT 1 FROM "TaskParticipant" tp WHERE tp."taskId" = t.id AND tp."participant" = t."owner");',
    'WITH collaborator_rows AS (',
    '  SELECT tc."taskId", NULLIF(BTRIM(tc."collaborator"), \'\') AS "participant", ROW_NUMBER() OVER (PARTITION BY tc."taskId" ORDER BY BTRIM(tc."collaborator"), tc."createdAt", tc."collaborator") AS collaborator_position',
    '  FROM "TaskCollaborator" tc',
    '), owner_offsets AS (',
    '  SELECT t.id AS "taskId", CASE WHEN COALESCE(NULLIF(BTRIM(t."owner"), \'\'), \'\') <> \'\' THEN 1 ELSE 0 END AS owner_offset',
    '  FROM "Task" t',
    ')',
    'INSERT INTO "TaskParticipant" ("taskId", "participant", "role", "position")',
    'SELECT c."taskId", c."participant", \'PARTICIPANT\'::"TaskParticipantRole", owner_offsets.owner_offset + c.collaborator_position - 1',
    'FROM collaborator_rows c',
    'JOIN owner_offsets ON owner_offsets."taskId" = c."taskId"',
    'WHERE c."participant" IS NOT NULL',
    '  AND NOT EXISTS (SELECT 1 FROM "TaskParticipant" tp WHERE tp."taskId" = c."taskId" AND tp."participant" = c."participant");',
    'COMMIT;',
  ]

  await runCommand(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-v', 'ON_ERROR_STOP=1', '-c', sqlParts.join(' ')],
    targetDir,
  )
}

async function runInstallerCommands(mode: InstallMode, targetDir: string, appUrl: string, postgresUser: string, postgresDb: string) {
  section('Pulling fresh Sally images')
  await runCommand('docker', ['compose', 'pull', 'api', 'web'], targetDir)

  section('Starting database')
  await runCommand('docker', ['compose', 'up', '-d', 'postgres'], targetDir)
  await waitForPostgres(targetDir, postgresUser, postgresDb)

  await maybeResolveBaselineMigration(targetDir, postgresUser, postgresDb)
  await maybeRepairInitSchemaDrift(targetDir, postgresUser, postgresDb)
  await maybeRepairBlockedStatuses(targetDir, postgresUser, postgresDb)
  await maybeRepairTaskPeopleMigrationState(targetDir, postgresUser, postgresDb)
  await maybeResolveFailedBlockedMigration(targetDir)

  section('Applying database migrations')
  await runCommand('docker', ['compose', 'run', '--rm', 'api', 'sh', '-lc', 'cd /app/packages/db && pnpm exec prisma migrate deploy --schema prisma/schema.prisma'], targetDir)

  const envText = await fs.readFile(path.join(targetDir, '.env'), 'utf8')
  if (/^BOOTSTRAP_SUPERADMIN_PASSWORD=.+$/m.test(envText)) {
    section('Bootstrapping superadmin')
    await runCommand('docker', ['compose', 'run', '--rm', 'api', 'pnpm', '--filter', 'api', 'bootstrap:install'], targetDir, { quiet: true })
  } else {
    console.log(paint('Skipping superadmin bootstrap because BOOTSTRAP_SUPERADMIN_PASSWORD is not present in .env', color.yellow))
  }

  if (mode === 'managed-simple') {
    section('Starting Sally services')
    await runCommand('docker', ['compose', 'up', '-d', '--force-recreate', 'api', 'web', 'caddy'], targetDir)
    await waitForHealth(`${appUrl}/api/health`, 'API')
    await waitForHealth(appUrl, 'Web app')
  } else {
    section('Starting Sally services')
    await runCommand('docker', ['compose', 'up', '-d', '--force-recreate', 'api', 'web'], targetDir)
    await waitForHealth('http://127.0.0.1:4000/health', 'API')
    await waitForHealth('http://127.0.0.1:3000', 'Web app')
  }
}

async function parseEnvFile(targetDir: string): Promise<ParsedEnv> {
  const envPath = path.join(targetDir, '.env')
  const composePath = path.join(targetDir, 'docker-compose.yml')

  const [envText, composeText] = await Promise.all([
    fs.readFile(envPath, 'utf8').catch(() => {
      throw new Error(`Missing ${envPath}. create-sally update only supports installs created by create-sally.`)
    }),
    fs.readFile(composePath, 'utf8').catch(() => {
      throw new Error(`Missing ${composePath}. create-sally update only supports installs created by create-sally.`)
    }),
  ])

  const values = new Map<string, string>()
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    values.set(line.slice(0, eqIndex), line.slice(eqIndex + 1))
  }

  const mode = values.get('SALLY_INSTALL_MODE')
  const appUrl = values.get('SALLY_URL') || values.get('APP_BASE_URL')
  const apiImage = values.get('SALLY_API_IMAGE')
  const webImage = values.get('SALLY_WEB_IMAGE')
  const imageTag = values.get('SALLY_IMAGE_TAG') || 'latest'
  const superadminEmail = values.get('SUPERADMIN_EMAIL') || 'unknown'

  if (mode !== 'managed-simple' && mode !== 'existing-infra') {
    throw new Error('Could not determine SALLY_INSTALL_MODE from .env. Refusing update.')
  }

  if (!appUrl || !apiImage || !webImage) {
    throw new Error('Missing one or more required Sally image/url values in .env. Refusing update.')
  }

  if (!composeText.includes('SALLY_API_IMAGE') || !composeText.includes('SALLY_WEB_IMAGE')) {
    throw new Error('docker-compose.yml does not look like a create-sally managed deployment. Refusing update.')
  }

  const postgresUser = values.get('POSTGRES_USER') || 'postgres'
  const postgresDb = values.get('POSTGRES_DB') || 'sally'

  return { mode, appUrl, apiImage, webImage, imageTag, superadminEmail, postgresUser, postgresDb }
}

async function updateEnvImageTag(targetDir: string, imageTag: string) {
  const envPath = path.join(targetDir, '.env')
  let envText = await fs.readFile(envPath, 'utf8')

  const replacements: Array<[RegExp, string]> = [
    [/^SALLY_IMAGE_TAG=.*$/m, `SALLY_IMAGE_TAG=${imageTag}`],
    [/^SALLY_API_IMAGE=.*$/m, `SALLY_API_IMAGE=ghcr.io/use-sally/sally-api:${imageTag}`],
    [/^SALLY_WEB_IMAGE=.*$/m, `SALLY_WEB_IMAGE=ghcr.io/use-sally/sally-web:${imageTag}`],
  ]

  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(envText)) {
      throw new Error(`Could not update ${envPath}: expected ${pattern.toString()} to exist.`)
    }
    envText = envText.replace(pattern, replacement)
  }

  await fs.writeFile(envPath, envText)
}

async function promptText(message: string, defaultValue?: string) {
  return await input({ message, default: defaultValue })
}

async function resolveTextOption(value: string | undefined, message: string, defaultValue?: string) {
  if (value !== undefined) return value
  return await promptText(message, defaultValue)
}

async function resolveRequiredTextOption(value: string | undefined, message: string, flagName: string, options: CliOptions, defaultValue?: string) {
  if (value !== undefined) return value
  if (options.yes) {
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Missing required option --${flagName} for non-interactive install.`)
  }
  return await promptText(message, defaultValue)
}

async function resolveConfirm(value: boolean, message: string, defaultValue = false) {
  if (value) return true
  return await confirm({ message, default: defaultValue })
}

async function resolveInstallMode(options: CliOptions) {
  if (options.mode) return options.mode
  if (options.yes) throw new Error('Missing required option --mode for non-interactive install.')
  return await select<InstallMode>({
    message: 'How do you want to install sally_?',
    choices: [
      { name: 'managed-simple — sally_ sets up Docker + Postgres + HTTPS', value: 'managed-simple' },
      { name: 'existing-infra — I already have infrastructure and want sally_ to fit into it', value: 'existing-infra' },
    ],
  })
}

function hasCompleteSmtpOptions(options: CliOptions) {
  return Boolean(options.smtpHost && options.smtpPort && options.smtpUser && options.smtpPassword && options.mailFrom)
}

async function resolveEmailSetupMode(options: CliOptions) {
  if (options.emailSetup === 'now' || options.emailSetup === 'later') return options.emailSetup
  if (hasCompleteSmtpOptions(options)) return 'now'
  if (options.yes) return 'later'
  return await select<'now' | 'later'>({
    message: 'Email setup is strongly recommended. Without it, sally_ cannot send invites, password resets, or notification emails. How do you want to continue?',
    choices: [
      { name: 'Configure email now (recommended)', value: 'now' },
      { name: 'I will configure email later in .env and restart the stack', value: 'later' },
    ],
  })
}

async function doctorFlow(options: CliOptions) {
  banner('doctor')

  section('Local tooling')
  const dockerInstalled = await hasCommand('docker')
  console.log(`${paint('docker', color.brightYellow)}: ${dockerInstalled ? paint('present', color.green) : paint('missing', color.red)}`)

  const composeInstalled = dockerInstalled ? await dockerComposeAvailable() : false
  console.log(`${paint('docker compose', color.brightYellow)}: ${composeInstalled ? paint('present', color.green) : paint('missing', color.red)}`)

  const targetDir = path.resolve(options.dir ?? '/opt/sally-instance')

  section('Install directory')
  console.log(`${paint('dir', color.brightYellow)}: ${targetDir}`)

  try {
    const current = await parseEnvFile(targetDir)
    console.log(`${paint('status', color.brightYellow)}: ${paint('installer-managed Sally deployment detected', color.green)}`)
    console.log(`${paint('mode', color.brightYellow)}: ${current.mode}`)
    console.log(`${paint('url', color.brightYellow)}: ${current.appUrl}`)
    console.log(`${paint('version', color.brightYellow)}: ${current.imageTag}`)
    console.log(`${paint('superadmin', color.brightYellow)}: ${current.superadminEmail}`)

    section('Schema checks')
    try {
      const drift = await inspectSchemaDriftState(targetDir, current.postgresUser, current.postgresDb)
      const taskPeopleDrift = await inspectTaskPeopleMigrationState(targetDir, current.postgresUser, current.postgresDb)
      const problems = [
        drift.missingProjectTaskCounter ? 'Project.taskCounter missing' : null,
        drift.missingTaskNumber ? 'Task.number missing' : null,
        drift.missingTaskProjectNumberIndex ? 'Task_projectId_number_key missing' : null,
        drift.missingProjectDependencyTable ? 'ProjectDependency table missing' : null,
        drift.missingTaskDependencyTable ? 'TaskDependency table missing' : null,
        taskPeopleDrift.missingTaskOwnerColumn ? 'Task.owner missing' : null,
        taskPeopleDrift.missingTaskParticipantTable ? 'TaskParticipant table missing' : null,
        taskPeopleDrift.taskParticipantBackfillIncomplete ? 'TaskParticipant backfill incomplete' : null,
      ].filter(Boolean)
      console.log(`${paint('schema', color.brightYellow)}: ${problems.length ? paint(problems.join('; '), color.red) : paint('ok', color.green)}`)
    } catch (error) {
      console.log(`${paint('schema', color.brightYellow)}: ${paint(`failed (${error instanceof Error ? error.message : String(error)})`, color.red)}`)
    }

    section('Health checks')
    try {
      if (current.mode === 'managed-simple') {
        await waitForHealth(`${current.appUrl}/api/health`, 'API', 2, 500)
        await waitForHealth(current.appUrl, 'Web app', 2, 500)
      } else {
        await waitForHealth('http://127.0.0.1:4000/health', 'API', 2, 500)
        await waitForHealth('http://127.0.0.1:3000', 'Web app', 2, 500)
      }
      console.log(`${paint('health', color.brightYellow)}: ${paint('ok', color.green)}`)
    } catch (error) {
      console.log(`${paint('health', color.brightYellow)}: ${paint(`failed (${error instanceof Error ? error.message : String(error)})`, color.red)}`)
    }
  } catch (error) {
    console.log(`${paint('status', color.brightYellow)}: ${paint(error instanceof Error ? error.message : String(error), color.red)}`)
  }
}

async function installFlow(options: CliOptions) {
  banner('install')
  await ensureDockerInstalled()

  const mode = await resolveInstallMode(options)
  const targetDir = path.resolve(options.dir ?? (options.yes ? '/opt/sally-instance' : await promptText('Where should the installer write the instance files?', '/opt/sally-instance')))
  const domain = normalizeDomain(await resolveRequiredTextOption(options.domain, 'Domain for this sally_ instance (example: sally.example.com)', 'domain', options))
  const appUrl = baseUrlFromDomain(domain)

  if (mode === 'managed-simple') {
    section('Checking DNS')
    await verifyManagedDomainPointsHere(domain)
  }

  const imageTag = await resolveTextOption(options.version, 'Sally version', 'latest')
  const workspaceName = await resolveRequiredTextOption(options.workspace, 'First workspace name', 'workspace', options, options.yes ? undefined : 'Operations')
  const workspaceSlug = slugifyWorkspaceName(workspaceName)
  const superadminEmail = await resolveRequiredTextOption(options.superadminEmail, 'Superadmin email', 'superadmin-email', options)
  const superadminName = await resolveRequiredTextOption(options.superadminName, 'Superadmin name', 'superadmin-name', options, options.yes ? 'Admin' : 'Admin')
  const caddyAcmeEmail = mode === 'managed-simple'
    ? await resolveRequiredTextOption(options.acmeEmail, 'ACME / TLS contact email', 'acme-email', options, superadminEmail)
    : ''

  const emailSetupMode = await resolveEmailSetupMode(options)

  let smtpConfigured = emailSetupMode === 'now'
  let smtpHost = 'smtp.disabled.invalid'
  let smtpPort = '587'
  let smtpUser = 'disabled'
  let smtpPassword = 'disabled'
  let mailFrom = `no-reply@${domain}`

  if (smtpConfigured) {
    smtpHost = await resolveRequiredTextOption(options.smtpHost, 'SMTP host', 'smtp-host', options)
    smtpPort = await resolveRequiredTextOption(options.smtpPort, 'SMTP port', 'smtp-port', options, '587')
    smtpUser = await resolveRequiredTextOption(options.smtpUser, 'SMTP username', 'smtp-user', options)
    smtpPassword = await resolveRequiredTextOption(options.smtpPassword, 'SMTP password', 'smtp-password', options)
    mailFrom = await resolveRequiredTextOption(options.mailFrom, 'MAIL_FROM address', 'mail-from', options, `no-reply@${domain}`)
  } else {
    const confirmLater = options.yes
      ? true
      : await confirm({
        message: 'I understand that invites, password resets, and notification emails will not work until I update SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and MAIL_FROM in .env and restart the stack.',
        default: false,
      })

    if (!confirmLater) {
      throw new Error('Email setup was skipped without confirmation. Restart the installer and configure email now, or confirm the manual-later path.')
    }
  }

  const postgresPassword = randomSecret(24)
  const sessionSecret = randomSecret(32)
  const appEncryptionKey = randomSecret(32)
  const bootstrapPassword = randomSecret(16)

  await fs.mkdir(targetDir, { recursive: true })
  await fs.writeFile(path.join(targetDir, '.env'), envFile({ mode, domain, appUrl, imageTag, workspaceName, workspaceSlug, superadminEmail, superadminName, smtpConfigured, smtpHost, smtpPort, smtpUser, smtpPassword, mailFrom, caddyAcmeEmail, postgresPassword, sessionSecret, appEncryptionKey, bootstrapPassword }))
  await fs.writeFile(path.join(targetDir, 'docker-compose.yml'), mode === 'managed-simple' ? composeForManagedSimple() : composeForExistingInfra())
  if (mode === 'managed-simple') {
    await fs.writeFile(path.join(targetDir, 'Caddyfile'), caddyfile(domain))
  }
  await fs.writeFile(path.join(targetDir, 'SETUP_NOTES.txt'), setupNotes(mode, bootstrapPassword, targetDir, appUrl, smtpConfigured))

  await runInstallerCommands(mode, targetDir, appUrl, 'postgres', 'sally')
  await writeHostedMcpNotes(targetDir, appUrl)
  printWelcome(mode, appUrl, superadminEmail, bootstrapPassword)
}

async function updateFlow(options: CliOptions) {
  banner('update')
  await ensureDockerInstalled()

  const nonInteractive = options.yes || !process.stdin.isTTY || !process.stdout.isTTY
  const targetDir = path.resolve(options.dir ?? (nonInteractive ? '/opt/sally-instance' : await promptText('Where is the existing sally_ install?', '/opt/sally-instance')))
  const current = await parseEnvFile(targetDir)

  section('Detected Sally install')
  console.log(`${paint('MODE', color.brightYellow)}: ${current.mode}`)
  console.log(`${paint('URL', color.brightYellow)}: ${current.appUrl}`)
  console.log(`${paint('CURRENT VERSION', color.brightYellow)}: ${current.imageTag}`)
  console.log(`${paint('SUPERADMIN', color.brightYellow)}: ${current.superadminEmail}`)

  const imageTag = options.version ?? (nonInteractive ? 'latest' : await resolveTextOption(undefined, 'Target Sally version', 'latest'))

  const proceed = nonInteractive
    ? true
    : await resolveConfirm(
        false,
        `Proceed with Sally update in ${targetDir}? This updates the deployed images, applies schema changes, restarts services. A local backup will be written first.`,
        false,
      )

  if (!proceed) {
    throw new Error('Update cancelled.')
  }

  await backupExistingInstance(targetDir, current.postgresUser, current.postgresDb)
  await updateEnvImageTag(targetDir, imageTag)
  await runInstallerCommands(current.mode, targetDir, current.appUrl, current.postgresUser, current.postgresDb)
  printUpdateSuccess(current.mode, current.appUrl, imageTag)
}

function parseArgs(argv: string[]): CliOptions {
  let command: CommandMode = 'install'
  let dir: string | undefined
  let version: string | undefined
  let yes = false
  let mode: InstallMode | undefined
  let domain: string | undefined
  let workspace: string | undefined
  let superadminEmail: string | undefined
  let superadminName: string | undefined
  let acmeEmail: string | undefined
  let emailSetup: 'now' | 'later' | undefined
  let smtpHost: string | undefined
  let smtpPort: string | undefined
  let smtpUser: string | undefined
  let smtpPassword: string | undefined
  let mailFrom: string | undefined

  const positional: string[] = []
  const requireValue = (flag: string, value: string | undefined) => {
    if (!value) throw new Error(`Missing value for ${flag}`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--yes') {
      yes = true
      continue
    }

    if (arg === '--dir') {
      dir = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--dir=')) {
      dir = requireValue('--dir', arg.slice('--dir='.length))
      continue
    }

    if (arg === '--version') {
      version = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--version=')) {
      version = requireValue('--version', arg.slice('--version='.length))
      continue
    }

    if (arg === '--mode') {
      const value = requireValue(arg, argv[index + 1])
      if (value !== 'managed-simple' && value !== 'existing-infra') throw new Error(`Invalid --mode: ${value}`)
      mode = value
      index += 1
      continue
    }
    if (arg.startsWith('--mode=')) {
      const value = requireValue('--mode', arg.slice('--mode='.length))
      if (value !== 'managed-simple' && value !== 'existing-infra') throw new Error(`Invalid --mode: ${value}`)
      mode = value
      continue
    }

    if (arg === '--domain') {
      domain = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--domain=')) {
      domain = requireValue('--domain', arg.slice('--domain='.length))
      continue
    }

    if (arg === '--workspace') {
      workspace = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--workspace=')) {
      workspace = requireValue('--workspace', arg.slice('--workspace='.length))
      continue
    }

    if (arg === '--superadmin-email') {
      superadminEmail = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--superadmin-email=')) {
      superadminEmail = requireValue('--superadmin-email', arg.slice('--superadmin-email='.length))
      continue
    }

    if (arg === '--superadmin-name') {
      superadminName = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--superadmin-name=')) {
      superadminName = requireValue('--superadmin-name', arg.slice('--superadmin-name='.length))
      continue
    }

    if (arg === '--acme-email') {
      acmeEmail = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--acme-email=')) {
      acmeEmail = requireValue('--acme-email', arg.slice('--acme-email='.length))
      continue
    }

    if (arg === '--email-setup') {
      const value = requireValue(arg, argv[index + 1])
      if (value !== 'now' && value !== 'later') throw new Error(`Invalid --email-setup: ${value}`)
      emailSetup = value
      index += 1
      continue
    }
    if (arg.startsWith('--email-setup=')) {
      const value = requireValue('--email-setup', arg.slice('--email-setup='.length))
      if (value !== 'now' && value !== 'later') throw new Error(`Invalid --email-setup: ${value}`)
      emailSetup = value
      continue
    }

    if (arg === '--smtp-host') {
      smtpHost = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--smtp-host=')) {
      smtpHost = requireValue('--smtp-host', arg.slice('--smtp-host='.length))
      continue
    }

    if (arg === '--smtp-port') {
      smtpPort = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--smtp-port=')) {
      smtpPort = requireValue('--smtp-port', arg.slice('--smtp-port='.length))
      continue
    }

    if (arg === '--smtp-user') {
      smtpUser = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--smtp-user=')) {
      smtpUser = requireValue('--smtp-user', arg.slice('--smtp-user='.length))
      continue
    }

    if (arg === '--smtp-password') {
      smtpPassword = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--smtp-password=')) {
      smtpPassword = requireValue('--smtp-password', arg.slice('--smtp-password='.length))
      continue
    }

    if (arg === '--mail-from') {
      mailFrom = requireValue(arg, argv[index + 1])
      index += 1
      continue
    }
    if (arg.startsWith('--mail-from=')) {
      mailFrom = requireValue('--mail-from', arg.slice('--mail-from='.length))
      continue
    }

    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    positional.push(arg)
  }

  if (positional[0]) {
    const raw = positional[0].trim().toLowerCase()
    if (raw === 'install' || raw === 'update' || raw === 'doctor') command = raw
    else throw new Error(`Unknown command: ${raw}. Supported commands: install, update, doctor`)
  }

  return {
    command,
    dir,
    version,
    yes,
    mode,
    domain,
    workspace,
    superadminEmail,
    superadminName,
    acmeEmail,
    emailSetup,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    mailFrom,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.command === 'doctor') await doctorFlow(options)
  else if (options.command === 'update') await updateFlow(options)
  else await installFlow(options)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
