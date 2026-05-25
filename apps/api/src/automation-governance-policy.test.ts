import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const schemaSource = fs.readFileSync(path.join(repoRoot, 'packages/db/prisma/schema.prisma'), 'utf8')
const apiSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const securityPageSource = fs.readFileSync(path.join(repoRoot, 'apps/web/app/security/page.tsx'), 'utf8')
const policyPanelSource = fs.readFileSync(path.join(repoRoot, 'apps/web/components/automation-governance-panel.tsx'), 'utf8')
const webApiSource = fs.readFileSync(path.join(repoRoot, 'apps/web/lib/api.ts'), 'utf8')

test('database stores instance automation governance policy', () => {
  assert.match(schemaSource, /model AutomationGovernancePolicy \{[\s\S]*id\s+String\s+@id\s+@default\("instance"\)/)
  assert.match(schemaSource, /allowedRuntimeTypes\s+String\[\]/)
  assert.match(schemaSource, /workflowStartRoles\s+String\[\]/)
  assert.match(schemaSource, /maxConcurrentWorkflowJobs\s+Int/)
  assert.match(schemaSource, /workflowStartRequiresApproval\s+Boolean/)
})

test('API exposes Enterprise automation policy endpoints and enforces policy', () => {
  assert.match(apiSource, /app\.get\('\/security\/automation-policy'/)
  assert.match(apiSource, /app\.put\('\/security\/automation-policy'/)
  assert.match(apiSource, /automation\.workflowPolicies/)
  assert.match(apiSource, /audit\.automationPolicy\.updated/)
  assert.match(apiSource, /Agent runtime is not allowed by automation governance policy/)
  assert.match(apiSource, /Workflow start is not allowed by automation governance policy/)
  assert.match(apiSource, /Workflow start requires approval by automation governance policy/)
  assert.match(apiSource, /Project workflow concurrency limit reached/)
})

test('Security UI shows automation governance locked in Community and editable in Enterprise', () => {
  assert.match(securityPageSource, /AutomationGovernancePanel/)
  assert.match(policyPanelSource, /hasFeature\(edition, 'automation\.workflowPolicies'\)/)
  assert.match(policyPanelSource, /EnterpriseLockedCard title="Automation governance"/)
  assert.match(policyPanelSource, /Allowed agent runtimes/)
  assert.match(policyPanelSource, /Who may start workflows/)
  assert.match(policyPanelSource, /Max concurrent workflow jobs per project/)
  assert.match(policyPanelSource, /Require approval before workflow starts/)
  assert.match(webApiSource, /getAutomationGovernancePolicy/)
  assert.match(webApiSource, /saveAutomationGovernancePolicy/)
})
