import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')

test('sally-agent-connect exposes an npx-compatible package and bin', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))

  assert.equal(pkg.name, 'sally-agent-connect')
  assert.equal(pkg.private, false)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.bin['sally-agent-connect'], './dist/cli.js')
  assert.equal(pkg.bin['sally-agent'], './dist/cli.js')
  assert.match(pkg.files.join('\n'), /dist/)
})

test('public runtime commands parse npx-style runtime subcommands and pairing flags', async () => {
  const { parseAgentConnectArgs } = await import('./cli-options.js')

  const parsed = parseAgentConnectArgs([
    'hermes',
    '--pairing-code', 'ABCD-EFGH',
    '--base-url', 'https://sally.example.com',
    '--workspace-slug', 'acme',
    '--once',
  ], { HOME: '/tmp/sally-home' })

  assert.equal(parsed.runtime, 'hermes')
  assert.equal(parsed.pairingCode, 'ABCD-EFGH')
  assert.equal(parsed.apiBaseUrl, 'https://sally.example.com')
  assert.equal(parsed.workspaceSlug, 'acme')
  assert.equal(parsed.once, true)
  assert.equal(parsed.background, false)
  assert.equal(parsed.tokenFile, '/tmp/sally-home/.sally/hermes-worker-token')
  assert.equal(parsed.cursorFile, '/tmp/sally-home/.sally/hermes-worker-cursor')
  assert.equal(parsed.pidFile, '/tmp/sally-home/.sally/hermes-worker.pid')
  assert.equal(parsed.logFile, '/tmp/sally-home/.sally/hermes-worker.log')

  const codex = parseAgentConnectArgs(['codex', '--pairing-code', 'CODEX-PAIR', '--once'], { HOME: '/tmp/sally-home' })
  assert.equal(codex.runtime, 'codex')
  assert.equal(codex.runtimeCommand, 'codex')
  assert.equal(codex.workerName, 'codex-local-worker')
  assert.equal(codex.tokenFile, '/tmp/sally-home/.sally/codex-worker-token')

  const background = parseAgentConnectArgs([
    'codex',
    '--pairing-code', 'CODEX-PAIR',
    '--background',
    '--pid-file', '/tmp/codex.pid',
    '--log-file', '/tmp/codex.log',
  ], { HOME: '/tmp/sally-home' })
  assert.equal(background.background, true)
  assert.equal(background.pidFile, '/tmp/codex.pid')
  assert.equal(background.logFile, '/tmp/codex.log')

  const claude = parseAgentConnectArgs(['claude-code', '--pairing-code', 'CLAUDE-PAIR', '--claude-command', 'claude'], { HOME: '/tmp/sally-home' })
  assert.equal(claude.runtime, 'claude-code')
  assert.equal(claude.runtimeCommand, 'claude')
})

test('public help teaches first-time users that Sally supplies multi-runtime connectors', async () => {
  const { renderHelp } = await import('./cli-options.js')
  const help = renderHelp()

  assert.match(help, /npx sally-agent-connect hermes --pairing-code <PAIRING_CODE>/)
  assert.match(help, /npx sally-agent-connect codex --pairing-code <PAIRING_CODE>/)
  assert.match(help, /npx sally-agent-connect pi --pairing-code <PAIRING_CODE>/)
  assert.match(help, /npx sally-agent-connect openclaw --pairing-code <PAIRING_CODE>/)
  assert.match(help, /npx sally-agent-connect claude-code --pairing-code <PAIRING_CODE>/)
  assert.match(help, /Hermes does not need to know Sally; neither do Codex, Pi, OpenClaw, or Claude Code/i)
  assert.match(help, /Sally connector/i)
})

test('codex runtime keeps workspace sandboxing but enables configured Sally API network access', async () => {
  const { getRuntimeDefinition } = await import('./runtime-registry.js')
  const argv = getRuntimeDefinition('codex').buildArgv({ prompt: 'inspect Sally' })

  assert.deepEqual(argv.slice(0, 6), [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '-c',
    'sandbox_workspace_write.network_access=true',
  ])
  assert.equal(argv.at(-1), 'inspect Sally')
  assert.doesNotMatch(argv.join(' '), /danger-full-access/)
})

test('unsupported runtimes fail before doing any Sally or agent work', async () => {
  const { parseAgentConnectArgs } = await import('./cli-options.js')

  assert.throws(
    () => parseAgentConnectArgs(['unknown-agent', '--pairing-code', 'ABCD-EFGH'], { HOME: '/tmp/sally-home' }),
    /Unsupported runtime: unknown-agent/,
  )
})

test('pairing code takes precedence over a stale token file', async () => {
  const { selectInitialWorkerToken } = await import('./hermes-worker.js')

  assert.deepEqual(selectInitialWorkerToken({ envToken: '', fileToken: 'sallyw_stale', pairingCode: 'ABCD-EFGH' }), {
    workerToken: '',
    shouldPair: true,
  })
  assert.deepEqual(selectInitialWorkerToken({ envToken: 'sallyw_env', fileToken: 'sallyw_stale', pairingCode: 'ABCD-EFGH' }), {
    workerToken: 'sallyw_env',
    shouldPair: false,
  })
  assert.deepEqual(selectInitialWorkerToken({ envToken: '', fileToken: 'sallyw_existing', pairingCode: '' }), {
    workerToken: 'sallyw_existing',
    shouldPair: false,
  })
})

test('connector supports detached background mode and exits when Sally revokes the connection', () => {
  const cliSource = fs.readFileSync(path.join(packageRoot, 'src/cli.ts'), 'utf8')
  const workerSource = fs.readFileSync(path.join(packageRoot, 'src/hermes-worker.ts'), 'utf8')

  assert.match(cliSource, /spawn\(process\.execPath, \[cliPath, \.\.\.withoutBackgroundFlag\(argv\)\]/)
  assert.match(cliSource, /detached:\s*true/)
  assert.match(cliSource, /fs\.writeFileSync\(args\.pidFile/)
  assert.match(workerSource, /class SallyConnectorAuthError extends Error/)
  assert.match(workerSource, /res\.status === 401 \|\| res\.status === 403/)
  assert.match(workerSource, /fs\.unlinkSync\(args\.tokenFile\)/)
  assert.match(workerSource, /fs\.unlinkSync\(args\.pidFile\)/)
  assert.match(workerSource, /connection was revoked or the worker token is no longer valid/)
})

test('published CLI is standalone and does not depend on the Sally monorepo api package', () => {
  const cliSource = fs.readFileSync(path.join(packageRoot, 'src/cli.ts'), 'utf8')

  assert.doesNotMatch(cliSource, /apps\/api/)
  assert.doesNotMatch(cliSource, /pnpm --filter api/)
})
