import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildHermesRuntimeConfig, buildHermesWorkerEnv, parseHermesConnectionArgs, safeConnectionSummary } from './hermes-agent-connection.js'
import { runLocalSallyWorkerOnce } from './local-sally-worker.js'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeSecretFile(file: string, value: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, value, { mode: 0o600 })
  fs.chmodSync(file, 0o600)
}

function readTokenFile(file: string) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : ''
}

async function completePairing(input: { apiBaseUrl: string; pairingCode: string; name: string; hermesProfile?: string; capabilities: string[] }) {
  const res = await fetch(`${input.apiBaseUrl.replace(/\/$/, '')}/agent-connections/complete-pairing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: input.pairingCode,
      name: input.name,
      runtimeType: 'hermes',
      runtimeVersion: 'hermes-local',
      profileRef: input.hermesProfile || 'local-hermes',
      capabilities: input.capabilities,
    }),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`Pairing failed with ${res.status}: ${text.slice(0, 500)}`)
  if (!data?.token) throw new Error('Pairing response did not include a worker token')
  return { token: String(data.token), connectionId: data.connection?.id ?? null }
}

function assertHermesAvailable(command: string) {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' })
  if (result.error) throw new Error(`Hermes command not found: ${command}`)
}

async function main() {
  const args = parseHermesConnectionArgs(process.argv.slice(2))
  assertHermesAvailable(args.hermesCommand)

  let workerToken = process.env.SALLY_API_KEY || readTokenFile(args.tokenFile)
  let connectionId: string | null = null
  if (!workerToken) {
    if (!args.pairingCode) throw new Error('No worker token found. Pass --pairing-code <CODE> or set SALLY_PAIRING_CODE for first-time connection.')
    const paired = await completePairing({ apiBaseUrl: args.apiBaseUrl, pairingCode: args.pairingCode, name: args.workerName, hermesProfile: args.hermesProfile, capabilities: args.capabilities })
    workerToken = paired.token
    connectionId = paired.connectionId
    writeSecretFile(args.tokenFile, workerToken)
  }

  const runtimeConfig = buildHermesRuntimeConfig({ command: args.hermesCommand, capabilities: args.capabilities, timeoutMs: args.timeoutMs })
  Object.assign(process.env, buildHermesWorkerEnv({
    apiBaseUrl: args.apiBaseUrl,
    workerToken,
    workspaceId: args.workspaceId,
    workspaceSlug: args.workspaceSlug,
    cursorFile: args.cursorFile,
    runtimeConfig,
  }), { SALLY_WORKER_NAME: args.workerName })

  console.log(JSON.stringify({ ok: true, mode: args.once ? 'once' : 'loop', ...safeConnectionSummary({ tokenFile: args.tokenFile, cursorFile: args.cursorFile, apiBaseUrl: args.apiBaseUrl, workerToken, connectionId }) }, null, 2))

  do {
    try {
      const result = await runLocalSallyWorkerOnce()
      console.log(JSON.stringify(result))
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
      if (args.once) process.exitCode = 1
    }
    if (!args.once) await sleep(5000)
  } while (!args.once)
}

if (process.argv[1]?.endsWith('connect-hermes-agent.ts') || process.argv[1]?.endsWith('connect-hermes-agent.js')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
