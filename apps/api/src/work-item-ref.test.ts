import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHostedMcpAgentJobCreatePayload, buildHostedMcpAgentRunCreatePayload } from './hosted-mcp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')
const schema = fs.readFileSync(path.join(repoRoot, 'packages/db/prisma/schema.prisma'), 'utf8')
const apiSource = fs.readFileSync(path.join(repoRoot, 'apps/api/src/index.ts'), 'utf8')
const hostedMcpSource = fs.readFileSync(path.join(repoRoot, 'apps/api/src/hosted-mcp.ts'), 'utf8')

test('schema has provider-neutral WorkItemRef linked to jobs and runs', () => {
  assert.match(schema, /enum WorkItemProvider\s*{[\s\S]*SALLY[\s\S]*LINEAR[\s\S]*JIRA[\s\S]*GITHUB[\s\S]*}/)
  assert.match(schema, /model WorkItemRef\s*{[\s\S]*provider\s+WorkItemProvider[\s\S]*externalId\s+String\?[\s\S]*externalUrl\s+String\?[\s\S]*titleSnapshot\s+String\?[\s\S]*descriptionSnapshot\s+String\?[\s\S]*sallyTaskId\s+String\?[\s\S]*@@unique\(\[workspaceId, provider, externalId\]\)/)
  assert.match(schema, /model AgentJob\s*{[\s\S]*workItemRefId\s+String\?[\s\S]*workItemRef\s+WorkItemRef\?\s+@relation/)
  assert.match(schema, /model AgentRun\s*{[\s\S]*workItemRefId\s+String\?[\s\S]*workItemRef\s+WorkItemRef\?\s+@relation/)
})

test('hosted MCP payloads accept workItemRef without requiring a Sally task', () => {
  const jobPayload = buildHostedMcpAgentJobCreatePayload({
    projectId: null,
    taskId: null,
    role: 'pm',
    mode: 'workflow',
    triggerType: 'mcp',
    workItemRef: {
      provider: 'linear',
      externalId: 'LIN-123',
      externalUrl: 'https://linear.app/acme/issue/LIN-123/ship-headless-agent-control',
      title: 'Ship headless agent control',
      description: 'Run Sally automation against a Linear issue.',
    },
  })
  assert.deepEqual(jobPayload.workItemRef, {
    provider: 'linear',
    externalId: 'LIN-123',
    externalUrl: 'https://linear.app/acme/issue/LIN-123/ship-headless-agent-control',
    title: 'Ship headless agent control',
    description: 'Run Sally automation against a Linear issue.',
  })

  const runPayload = buildHostedMcpAgentRunCreatePayload({
    jobId: 'job_123',
    role: 'pm',
    status: 'RUNNING',
    triggerType: 'mcp',
    workItemRefId: 'wir_123',
  })
  assert.equal(runPayload.workItemRefId, 'wir_123')
})

test('API resolves work item references when creating Sally-native or external agent jobs and runs', () => {
  assert.match(apiSource, /async function resolveWorkItemRef/)
  assert.match(apiSource, /provider:\s*WorkItemProvider\.SALLY/) 
  assert.match(apiSource, /provider:\s*normalizeWorkItemProvider\(workItemRef\.provider\)/)
  assert.match(apiSource, /workItemRefId:\s*resolvedWorkItemRefId/)
  assert.match(hostedMcpSource, /export type WorkItemRefInput/)
})
