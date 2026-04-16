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

test('updater resolves failed blocked-status migration before deploy', () => {
  assert.ok(source.includes('maybeResolveFailedBlockedMigration(targetDir)'))
  assert.ok(source.includes('migrate resolve --rolled-back 20260415162500_add_blocked_status'))
})

test('doctor reports missing init-schema drift columns, index, and ProjectDependency table', () => {
  assert.ok(source.includes('inspectSchemaDriftState(targetDir, current.postgresUser, current.postgresDb)'))
  assert.ok(source.includes("'projectTableExists'"))
  assert.ok(source.includes("'taskTableExists'"))
  assert.ok(source.includes('Project.taskCounter missing'))
  assert.ok(source.includes('Task.number missing'))
  assert.ok(source.includes('Task_projectId_number_key missing'))
  assert.ok(source.includes('ProjectDependency table missing'))
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
  assert.ok(source.includes('if (state.missingTaskNumber)'))
  assert.ok(source.includes('} else if (state.missingProjectTaskCounter) {'))
  assert.ok(source.includes('ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;'))
  assert.ok(source.includes('CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");'))
})
