export type SupportedAgentRuntime = 'hermes'

export type AgentConnectArgs = {
  runtime: SupportedAgentRuntime
  pairingCode?: string
  apiBaseUrl: string
  workspaceId?: string
  workspaceSlug: string
  tokenFile: string
  cursorFile: string
  workerName: string
  runtimeCommand: string
  runtimeProfile?: string
  capabilities?: string
  timeoutMs?: string
  once: boolean
  installService: boolean
}

function readFlag(argv: string[], name: string) {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function hasFlag(argv: string[], name: string) {
  return argv.includes(name)
}

export function renderHelp() {
  return `Sally agent connector

Hermes does not need to know Sally. The Sally connector pairs this machine with Sally,
stores a local worker token, listens for Sally jobs, and invokes the local Hermes CLI.

First-time Hermes connection:
  npx sally-agent-connect hermes --pairing-code <PAIRING_CODE>

Common options:
  --base-url <URL>          Sally API base URL. Default: http://localhost:4000
  --workspace-id <ID>       Sally workspace ID, if provided by the UI
  --workspace-slug <SLUG>   Sally workspace slug. Default: release-validation
  --name <NAME>             Local worker display name. Default: hermes-local-worker
  --hermes-command <CMD>    Hermes executable. Default: hermes
  --hermes-profile <NAME>   Optional Hermes profile
  --once                    Process one event/job and exit
  --token-file <PATH>       Worker token file. Default: ~/.sally/hermes-worker-token
  --cursor-file <PATH>      Event cursor file. Default: ~/.sally/hermes-worker-cursor

After first pairing:
  npx sally-agent-connect hermes --base-url http://localhost:4000 --workspace-slug release-validation
`
}

export function parseAgentConnectArgs(argv: string[], env: Record<string, string | undefined> = process.env): AgentConnectArgs {
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) throw new Error(renderHelp())

  const [runtimeArg] = argv
  if (!runtimeArg) throw new Error(`Missing runtime.\n\n${renderHelp()}`)
  if (runtimeArg !== 'hermes') throw new Error(`Unsupported runtime: ${runtimeArg}. Currently supported: hermes`)

  const home = env.HOME || process.cwd()
  return {
    runtime: 'hermes',
    pairingCode: readFlag(argv, '--pairing-code') || env.SALLY_PAIRING_CODE,
    apiBaseUrl: readFlag(argv, '--base-url') || env.SALLY_API_BASE_URL || 'http://localhost:4000',
    workspaceId: readFlag(argv, '--workspace-id') || env.SALLY_WORKSPACE_ID,
    workspaceSlug: readFlag(argv, '--workspace-slug') || env.SALLY_WORKSPACE_SLUG || 'release-validation',
    tokenFile: readFlag(argv, '--token-file') || env.SALLY_WORKER_TOKEN_FILE || `${home}/.sally/hermes-worker-token`,
    cursorFile: readFlag(argv, '--cursor-file') || env.SALLY_WORKER_CURSOR_FILE || `${home}/.sally/hermes-worker-cursor`,
    workerName: readFlag(argv, '--name') || env.SALLY_WORKER_NAME || 'hermes-local-worker',
    runtimeCommand: readFlag(argv, '--hermes-command') || env.SALLY_HERMES_COMMAND || 'hermes',
    runtimeProfile: readFlag(argv, '--hermes-profile') || env.SALLY_HERMES_PROFILE,
    capabilities: readFlag(argv, '--capabilities') || env.SALLY_HERMES_CAPABILITIES,
    timeoutMs: readFlag(argv, '--timeout-ms') || env.SALLY_HERMES_TIMEOUT_MS,
    once: hasFlag(argv, '--once') || env.SALLY_WORKER_ONCE === '1',
    installService: hasFlag(argv, 'install-service') || hasFlag(argv, '--install-service'),
  }
}

export function toHermesConnectorArgs(args: AgentConnectArgs) {
  const result = [
    ...(args.pairingCode ? ['--pairing-code', args.pairingCode] : []),
    '--base-url', args.apiBaseUrl,
    '--workspace-slug', args.workspaceSlug,
    '--token-file', args.tokenFile,
    '--cursor-file', args.cursorFile,
    '--name', args.workerName,
    '--hermes-command', args.runtimeCommand,
  ]
  if (args.workspaceId) result.push('--workspace-id', args.workspaceId)
  if (args.runtimeProfile) result.push('--hermes-profile', args.runtimeProfile)
  if (args.capabilities) result.push('--capabilities', args.capabilities)
  if (args.timeoutMs) result.push('--timeout-ms', args.timeoutMs)
  if (args.once) result.push('--once')
  return result
}
