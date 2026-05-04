import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHermesRuntimeConfig, buildHermesWorkerEnv, defaultHermesCapabilities, parseHermesConnectionArgs, safeConnectionSummary } from './hermes-agent-connection'

test('default Hermes capabilities cover Sally orchestration roles and tools', () => {
  assert.deepEqual(defaultHermesCapabilities(), ['pm', 'architecture', 'planning', 'code', 'git', 'tools'])
})

test('Hermes runtime config is quiet-compatible and role/capability based by default', () => {
  assert.deepEqual(buildHermesRuntimeConfig({ command: 'hermes', timeoutMs: 1234 }), {
    runtimes: {
      hermes: {
        enabled: true,
        command: 'hermes',
        defaultArgs: [],
        allowedRepoPaths: [],
        capabilities: ['pm', 'architecture', 'planning', 'code', 'git', 'tools'],
        timeoutMs: 1234,
      },
    },
  })
})

test('Hermes worker env includes token and runtime config but not pairing code', () => {
  const env = buildHermesWorkerEnv({
    apiBaseUrl: 'http://localhost:4000',
    workerToken: 'sallyw_secret',
    workspaceId: 'workspace_1',
    workspaceSlug: 'release-validation',
    cursorFile: '/tmp/cursor',
    runtimeConfig: buildHermesRuntimeConfig(),
  })
  assert.equal(env.SALLY_API_BASE_URL, 'http://localhost:4000')
  assert.equal(env.SALLY_API_KEY, 'sallyw_secret')
  assert.equal(env.SALLY_WORKSPACE_ID, 'workspace_1')
  assert.equal(env.SALLY_WORKSPACE_SLUG, 'release-validation')
  assert.equal(env.SALLY_WORKER_CURSOR_FILE, '/tmp/cursor')
  assert.ok(env.SALLY_RUNTIME_CONFIG?.includes('"hermes"'))
  assert.equal('SALLY_PAIRING_CODE' in env, false)
})

test('connection summary redacts worker token values', () => {
  const summary = safeConnectionSummary({ tokenFile: '/tmp/token', cursorFile: '/tmp/cursor', apiBaseUrl: 'http://localhost:4000', workerToken: 'sallyw_secret' })
  assert.equal(summary.workerToken, '[REDACTED]')
  assert.equal(summary.tokenFile, '/tmp/token')
})

test('argument parser supports standard Hermes connection flags', () => {
  const parsed = parseHermesConnectionArgs(['--pairing-code', 'ABCD-EFGH', '--base-url', 'http://localhost:4000', '--workspace-id', 'workspace_1', '--once'])
  assert.equal(parsed.pairingCode, 'ABCD-EFGH')
  assert.equal(parsed.apiBaseUrl, 'http://localhost:4000')
  assert.equal(parsed.workspaceId, 'workspace_1')
  assert.equal(parsed.once, true)
})
