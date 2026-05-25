import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const source = readFileSync(path.join(import.meta.dirname, 'index.ts'), 'utf8')

test('blocked status repair uses project-by-project updates with unique temporary positions', () => {
  assert.ok(source.includes('for (const projectId of affectedProjects)'))
  assert.ok(source.includes('1000 + index'))
  assert.ok(source.includes('filter((s) => s.position >= 2)'))
  assert.ok(source.includes('UPDATE "TaskStatus" SET "position" = ${1000 + index} WHERE id = ${sqlLiteral(status.id)};'))
})

test('blocked status repair reorders custom statuses after done', () => {
  assert.ok(source.includes('const customStatuses = statuses.filter'))
  assert.ok(source.includes('5 + index'))
  assert.ok(source.includes('UPDATE "TaskStatus" SET "position" = ${5 + index} WHERE id = ${sqlLiteral(status.id)};'))
})

test('updater skips bootstrap cleanly when BOOTSTRAP_SUPERADMIN_PASSWORD is missing', () => {
  assert.ok(source.includes('Skipping superadmin bootstrap because BOOTSTRAP_SUPERADMIN_PASSWORD is not present in .env'))
  assert.ok(source.includes('BOOTSTRAP_SUPERADMIN_PASSWORD'))
  assert.ok(source.includes('test(envText)'))
})

test('updater bootstraps superadmin through the api package script instead of a dist file path', () => {
  assert.ok(source.includes("'compose', 'run', '--rm', 'api', 'pnpm', '--filter', 'api', 'bootstrap:install'"))
  assert.ok(!source.includes("'node', 'apps/api/dist/bootstrap.js'"))
})

test('updater resolves failed blocked-status migration before deploy', () => {
  assert.ok(source.includes('maybeResolveFailedBlockedMigration(targetDir, postgresUser, postgresDb)'))
  assert.ok(source.includes('migrate resolve --rolled-back 20260415162500_add_blocked_status'))
})

test('doctor reports missing init-schema drift columns, indexes, and dependency tables', () => {
  assert.ok(source.includes('inspectSchemaDriftState(targetDir, current.postgresUser, current.postgresDb)'))
  assert.ok(source.includes("'projectTableExists'"))
  assert.ok(source.includes("'taskTableExists'"))
  assert.ok(source.includes('Project.taskCounter missing'))
  assert.ok(source.includes('Task.number missing'))
  assert.ok(source.includes('Task_projectId_number_key missing'))
  assert.ok(source.includes('ProjectDependency table missing'))
  assert.ok(source.includes('TaskDependency table missing'))
})

test('updater repairs missing init-schema drift before running migrations', () => {
  assert.ok(source.includes('maybeRepairInitSchemaDrift(targetDir, postgresUser, postgresDb)'))
  assert.ok(source.includes('if (!state.projectTableExists || !state.taskTableExists) return'))
  assert.ok(source.includes('ALTER TABLE "Project" ADD COLUMN "taskCounter" INTEGER NOT NULL DEFAULT 0;'))
  assert.ok(source.includes('ALTER TABLE "Task" ADD COLUMN "number" INTEGER;'))
  assert.ok(source.includes('CREATE TABLE "ProjectDependency" ('))
  assert.ok(source.includes('CONSTRAINT "ProjectDependency_pkey" PRIMARY KEY ("projectId","dependsOnId")'))
  assert.ok(source.includes('ALTER TABLE "ProjectDependency" ADD CONSTRAINT "ProjectDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;'))
  assert.ok(source.includes('ALTER TABLE "ProjectDependency" ADD CONSTRAINT "ProjectDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;'))
  assert.ok(source.includes('CREATE TABLE "TaskDependency" ('))
  assert.ok(source.includes('CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("taskId","dependsOnId")'))
  assert.ok(source.includes('ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;'))
  assert.ok(source.includes('ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;'))
  assert.ok(source.includes('if (state.missingTaskNumber)'))
  assert.ok(source.includes('} else if (state.missingProjectTaskCounter) {'))
  assert.ok(source.includes('ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;'))
  assert.ok(source.includes('CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");'))
})

test('updater inspects and repairs task owner/participants rollout drift before migrate deploy', () => {
  assert.ok(source.includes('inspectTaskPeopleMigrationState'))
  assert.ok(source.includes('pg_temp.inspect_task_people_migration_state'))
  assert.ok(source.includes('TaskParticipant'))
  assert.ok(source.includes('TaskParticipantRole'))
  assert.ok(source.includes(`EXECUTE 'SELECT EXISTS (`))
  assert.ok(source.includes(`IF task_table_exists AND NOT missing_task_participant_table THEN`))
})

test('updater refuses ambiguous task owner/participants drift states', () => {
  assert.ok(source.includes('Detected ambiguous task owner/participants schema drift'))
  assert.ok(source.includes('Refusing automatic reconciliation because the database is only partially through the owner/participants rollout.'))
})

test('doctor reports missing Enterprise schema after migration checks', () => {
  assert.ok(source.includes('inspectEnterpriseSchemaState'))
  assert.ok(source.includes("'missingInstalledLicenseTable'"))
  assert.ok(source.includes("'missingSamlIdentityProviderTable'"))
  assert.ok(source.includes("'missingAutomationGovernancePolicyTable'"))
  assert.ok(source.includes("'missingApiMcpKeyPolicyTable'"))
  assert.ok(source.includes("'missingSessionPolicyTable'"))
  assert.ok(source.includes("'missingTwoFactorPolicyTable'"))
  assert.ok(source.includes("'missingAuditLogPolicyTable'"))
  assert.ok(source.includes("'missingAuthenticationPolicyTable'"))
  assert.ok(source.includes("'missingAccountTwoFactorCredentialTable'"))
  assert.ok(source.includes("'missingAccountTwoFactorChallengeTable'"))
  assert.ok(source.includes("'missingAccountWebAuthnCredentialTable'"))
  assert.ok(source.includes("'missingAccountWebAuthnChallengeTable'"))
  assert.ok(source.includes("table_name = 'InstalledLicense'"))
  assert.ok(source.includes("table_name = 'ApiMcpKeyPolicy'"))
  assert.ok(source.includes("table_name = 'SessionPolicy'"))
  assert.ok(source.includes("table_name = 'TwoFactorPolicy'"))
  assert.ok(source.includes("table_name = 'AuditLogPolicy'"))
  assert.ok(source.includes("table_name = 'AuthenticationPolicy'"))
  assert.ok(source.includes("table_name = 'AccountTwoFactorCredential'"))
  assert.ok(source.includes("table_name = 'AccountTwoFactorChallenge'"))
  assert.ok(source.includes("table_name = 'AccountWebAuthnCredential'"))
  assert.ok(source.includes("table_name = 'AccountWebAuthnChallenge'"))
  assert.ok(source.includes('InstalledLicense table missing'))
  assert.ok(source.includes('ApiMcpKeyPolicy table missing'))
  assert.ok(source.includes('SessionPolicy table missing'))
  assert.ok(source.includes('TwoFactorPolicy table missing'))
  assert.ok(source.includes('AuditLogPolicy table missing'))
  assert.ok(source.includes('AuthenticationPolicy table missing'))
  assert.ok(source.includes('AccountTwoFactorCredential table missing'))
  assert.ok(source.includes('AccountTwoFactorChallenge table missing'))
  assert.ok(source.includes('AccountWebAuthnCredential table missing'))
  assert.ok(source.includes('AccountWebAuthnChallenge table missing'))
})

test('install and update run one ordered migration pipeline before starting services', () => {
  assert.ok(source.includes('async function applyDatabaseMigrations(targetDir: string, postgresUser: string, postgresDb: string)'))
  assert.ok(source.includes('await maybeResolveBaselineMigration(targetDir, postgresUser, postgresDb)'))
  assert.ok(source.includes('await maybeRepairInitSchemaDrift(targetDir, postgresUser, postgresDb)'))
  assert.ok(source.includes('await maybeRepairBlockedStatuses(targetDir, postgresUser, postgresDb)'))
  assert.ok(source.includes('await maybeRepairTaskPeopleMigrationState(targetDir, postgresUser, postgresDb)'))
  assert.ok(source.includes('await maybeResolveFailedBlockedMigration(targetDir, postgresUser, postgresDb)'))
  assert.ok(source.includes("pnpm exec prisma migrate deploy --schema prisma/schema.prisma"))
  assert.ok(source.indexOf('await applyDatabaseMigrations(targetDir, postgresUser, postgresDb)') < source.indexOf("section('Starting Sally services')"))
})

test('doctor starts postgres and applies pending migrations for managed instances', () => {
  assert.ok(source.includes("section('Doctor migration check')"))
  assert.ok(source.includes("await runCommand('docker', ['compose', 'up', '-d', 'postgres'], targetDir)"))
  assert.ok(source.includes('await waitForPostgres(targetDir, current.postgresUser, current.postgresDb)'))
  assert.ok(source.includes('await applyDatabaseMigrations(targetDir, current.postgresUser, current.postgresDb)'))
  assert.ok(source.includes("paint('database migrations', color.brightYellow)"))
  assert.ok(source.includes("paint('applied', color.green)"))
})

test('generated compose files persist API uploads across image updates', () => {
  assert.match(source, /function composeForManagedSimple\(\)[\s\S]*- sally-uploads:\/app\/uploads/)
  assert.match(source, /function composeForExistingInfra\(\)[\s\S]*- sally-uploads:\/app\/uploads/)
  assert.ok(source.includes('volumes:\n  sally-postgres:\n  sally-uploads:\n  caddy-data:'))
  assert.ok(source.includes('volumes:\n  sally-postgres:\n  sally-uploads:\n`'))
})

test('updater backs up the runtime uploads directory used by the API container', () => {
  assert.ok(source.includes('const runtimeUploadsDir = \'/app/uploads\''))
  assert.ok(source.includes('`${apiContainerId}:${runtimeUploadsDir}/.`'))
  assert.ok(!source.includes('`${apiContainerId}:/app/apps/api/uploads/.`'))
})

test('generated and repaired managed Caddy CSP allows local blob image previews', () => {
  assert.match(source, /img-src 'self' data: blob:/)
  assert.match(source, /function contentSecurityPolicy\(domain: string\)/)
  assert.match(source, /Content-Security-Policy "\$\{contentSecurityPolicy\(domain\)\}"/)
  assert.match(source, /Updated Caddyfile CSP to allow blob: image previews\./)
})

test('doctor reports and repairs runtime config needed for image uploads', () => {
  assert.match(source, /section\('Runtime config checks'\)/)
  assert.match(source, /inspectRuntimeConfigState\(targetDir, current\.mode\)/)
  assert.match(source, /'API uploads volume missing'/)
  assert.match(source, /'CSP blocks blob: image previews'/)
  assert.match(source, /await ensureRuntimeConfig\(targetDir, current\.mode, current\.appUrl\)/)
  assert.match(source, /await runCommand\('docker', \['compose', 'up', '-d', 'api', 'caddy'\], targetDir\)/)
})
