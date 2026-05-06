import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildAgentConnectionPatch,
  buildAgentEventPayload,
  chooseAgentEventCursor,
  createAgentWorkerToken,
  hashAgentWorkerToken,
  normalizeRuntimeType,
  redactAgentConnection,
  verifyAgentWorkerToken,
} from './agent-connector.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiIndexSource = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8')

test('worker tokens are generated once and verified by hash only', () => {
  const token = createAgentWorkerToken()
  const hash = hashAgentWorkerToken(token)

  assert.match(token, /^sallyw_[A-Za-z0-9_-]+$/)
  assert.notEqual(hash, token)
  assert.equal(verifyAgentWorkerToken(token, hash), true)
  assert.equal(verifyAgentWorkerToken(`${token}x`, hash), false)
})

test('connection patches normalize runtimes and capabilities without accepting secret-like metadata', () => {
  assert.deepEqual(buildAgentConnectionPatch({
    name: ' Office Worker ',
    runtimeType: 'Claude Code',
    runtimeVersion: '1.2.3',
    capabilities: [' Git ', 'git', 'Terminal'],
    metadata: { hostname: 'developer-laptop' },
  }), {
    name: 'Office Worker',
    runtimeType: 'claude-code',
    runtimeVersion: '1.2.3',
    capabilities: ['git', 'terminal'],
    metadata: { hostname: 'developer-laptop' },
  })

  assert.equal(normalizeRuntimeType('OpenClaw'), 'openclaw')
  assert.equal(normalizeRuntimeType('custom runtime'), 'custom-runtime')
  assert.throws(() => buildAgentConnectionPatch({ metadata: { apiToken: 'nope' } }), /secret-like key/)
})

test('event payloads reject secret-like keys and stay generic', () => {
  assert.deepEqual(buildAgentEventPayload('job.created', { jobId: 'job_1', projectId: 'project_1' }), {
    type: 'job.created',
    payload: { jobId: 'job_1', projectId: 'project_1' },
  })
  assert.throws(() => buildAgentEventPayload('job.created', { credentials: { value: 'nope' } }), /secret-like key/)
})

test('event cursor prefers explicit client cursor and otherwise resumes from server-side ack', () => {
  assert.equal(chooseAgentEventCursor({ queryCursor: ' cursor_evt ', ackLastEventId: 'ack_evt' }), 'cursor_evt')
  assert.equal(chooseAgentEventCursor({ queryCursor: '', ackLastEventId: ' ack_evt ' }), 'ack_evt')
  assert.equal(chooseAgentEventCursor({ queryCursor: undefined, ackLastEventId: null }), '')
})

test('redacted connection summaries do not expose token hashes', () => {
  const summary = redactAgentConnection({
    id: 'conn_1',
    workspaceId: 'workspace_1',
    agentId: null,
    name: 'Worker',
    runtimeType: 'hermes',
    runtimeVersion: null,
    status: 'ONLINE',
    capabilities: ['code'],
    profileRef: null,
    tokenPrefix: 'sallyw_abc',
    tokenHash: 'hash-secret',
    lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    revokedAt: null,
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  })

  assert.equal('tokenHash' in summary, false)
  assert.equal(summary.tokenPrefix, 'sallyw_abc')
})

test('revoke connection clears queued and active workflow work in the workspace', () => {
  assert.match(apiIndexSource, /const clearQueue = \(request\.body as \{ clearQueue\?: boolean \} \| null\)\?\.clearQueue !== false/)
  assert.match(apiIndexSource, /if \(clearQueue\) \{[\s\S]*tx\.agentJob\.updateMany\(\{ where: \{ workspaceId: workspace\.id, status: \{ in: \[AgentJobStatus\.QUEUED, AgentJobStatus\.CLAIMED, AgentJobStatus\.RUNNING\] \} \}/)
  assert.match(apiIndexSource, /tx\.agentRun\.updateMany\(\{ where: \{ workspaceId: workspace\.id, status: \{ in: \[AgentRunStatus\.QUEUED, AgentRunStatus\.RUNNING\] \} \}/)
  assert.match(apiIndexSource, /payload: \{ connectionId, clearQueue, cancelledJobs: cancelledJobs\.count, cancelledRuns: cancelledRuns\.count \}/)
  assert.match(apiIndexSource, /return \{ ok: true, clearQueue, cancelledJobs: cancelledJobs\.count, cancelledRuns: cancelledRuns\.count \}/)
})
