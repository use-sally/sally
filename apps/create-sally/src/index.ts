#!/usr/bin/env node
import { confirm, input, select } from '@inquirer/prompts'
import crypto from 'node:crypto'
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
  const sql = [
    'SELECT json_build_object(',
    "  'hasMigrationsTable', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations'),",
    "  'coreTableCount', (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('Workspace', 'Project', 'TaskStatus', 'Task')),",
    "  'baselineApplied', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') THEN EXISTS (SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name = '20260410182000_init') ELSE false END",
    ');',
  ].join(' ')

  const raw = await runCommandCapture(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', postgresUser, '-d', postgresDb, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    targetDir,
  )
  const jsonLine = raw.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find((line) => line.startsWith('{') && line.endsWith('}'))
  if (!jsonLine) throw new Error(`Could not inspect migration state. Output was:\n${raw}`)
  return JSON.parse(jsonLine) as MigrationState
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

async function runInstallerCommands(mode: InstallMode, targetDir: string, appUrl: string, postgresUser: string, postgresDb: string) {
  section('Pulling fresh Sally images')
  await runCommand('docker', ['compose', 'pull', 'api', 'web'], targetDir)

  section('Starting database')
  await runCommand('docker', ['compose', 'up', '-d', 'postgres'], targetDir)
  await waitForPostgres(targetDir, postgresUser, postgresDb)

  await maybeResolveBaselineMigration(targetDir, postgresUser, postgresDb)

  section('Applying database migrations')
  await runCommand('docker', ['compose', 'run', '--rm', 'api', 'sh', '-lc', 'cd /app/packages/db && pnpm exec prisma migrate deploy --schema prisma/schema.prisma'], targetDir)

  section('Bootstrapping superadmin')
  await runCommand('docker', ['compose', 'run', '--rm', 'api', 'node', 'apps/api/dist/bootstrap.js'], targetDir, { quiet: true })

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

  const targetDir = path.resolve(options.dir ?? await promptText('Where is the existing sally_ install?', '/opt/sally-instance'))
  const current = await parseEnvFile(targetDir)

  section('Detected Sally install')
  console.log(`${paint('MODE', color.brightYellow)}: ${current.mode}`)
  console.log(`${paint('URL', color.brightYellow)}: ${current.appUrl}`)
  console.log(`${paint('CURRENT VERSION', color.brightYellow)}: ${current.imageTag}`)
  console.log(`${paint('SUPERADMIN', color.brightYellow)}: ${current.superadminEmail}`)

  const imageTag = await resolveTextOption(options.version, 'Target Sally version', 'latest')

  const proceed = await resolveConfirm(
    options.yes,
    `Proceed with Sally update in ${targetDir}? This updates the deployed images, applies schema changes, and restarts services. Back up Postgres first if this matters.`,
    false,
  )

  if (!proceed) {
    throw new Error('Update cancelled.')
  }

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
