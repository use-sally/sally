import { getRuntimeDefinition, isSupportedAgentRuntime, SUPPORTED_AGENT_RUNTIMES, type SupportedAgentRuntime } from './runtime-registry.js'

export type { SupportedAgentRuntime }

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
  background: boolean
  pidFile: string
  logFile: string
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

Sally connector pairs this machine with Sally, stores a local worker token,
listens for Sally jobs, and invokes the selected local agent CLI.

First-time connections:
  npx sally-agent-connect hermes --pairing-code <PAIRING_CODE>
  npx sally-agent-connect codex --pairing-code <PAIRING_CODE>
  npx sally-agent-connect pi --pairing-code <PAIRING_CODE>
  npx sally-agent-connect openclaw --pairing-code <PAIRING_CODE>
  npx sally-agent-connect claude-code --pairing-code <PAIRING_CODE>

Supported runtimes: ${SUPPORTED_AGENT_RUNTIMES.join(', ')}
Hermes does not need to know Sally; neither do Codex, Pi, OpenClaw, or Claude Code.

Common options:
  --base-url <URL>          Sally API base URL. Default: http://localhost:4000
  --workspace-id <ID>       Sally workspace ID, if provided by the UI
  --workspace-slug <SLUG>   Sally workspace slug. Default: release-validation
  --name <NAME>             Local worker display name. Default: runtime-specific
  --runtime-command <CMD>   Override selected agent executable
  --runtime-profile <NAME>  Optional selected-agent profile
  --once                    Process one event/job and exit
  --background              Start the connector detached, write pid/log files, then return
  --pid-file <PATH>         Background pid file. Default: ~/.sally/<runtime>-worker.pid
  --log-file <PATH>         Background log file. Default: ~/.sally/<runtime>-worker.log
  --token-file <PATH>       Worker token file. Default: ~/.sally/<runtime>-worker-token
  --cursor-file <PATH>      Event cursor file. Default: ~/.sally/<runtime>-worker-cursor

Runtime-specific command aliases are also accepted:
  --hermes-command, --codex-command, --pi-command, --openclaw-command, --claude-command
  --hermes-profile, --codex-profile, --openclaw-profile, --claude-profile

After first pairing:
  npx sally-agent-connect hermes --base-url http://localhost:4000 --workspace-slug release-validation
`
}

export function parseAgentConnectArgs(argv: string[], env: Record<string, string | undefined> = process.env): AgentConnectArgs {
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) throw new Error(renderHelp())

  const [runtimeArg] = argv
  if (!runtimeArg) throw new Error(`Missing runtime.\n\n${renderHelp()}`)
  if (!isSupportedAgentRuntime(runtimeArg)) throw new Error(`Unsupported runtime: ${runtimeArg}. Currently supported: ${SUPPORTED_AGENT_RUNTIMES.join(', ')}`)

  const definition = getRuntimeDefinition(runtimeArg)
  const home = env.HOME || process.cwd()
  const defaultStateDir = `${home}/.sally`
  const runtimeProfile = readFlag(argv, '--runtime-profile') || (definition.profileFlag ? readFlag(argv, definition.profileFlag) : undefined) || (definition.envProfile ? env[definition.envProfile] : undefined)
  return {
    runtime: runtimeArg,
    pairingCode: readFlag(argv, '--pairing-code') || env.SALLY_PAIRING_CODE,
    apiBaseUrl: readFlag(argv, '--base-url') || env.SALLY_API_BASE_URL || 'http://localhost:4000',
    workspaceId: readFlag(argv, '--workspace-id') || env.SALLY_WORKSPACE_ID,
    workspaceSlug: readFlag(argv, '--workspace-slug') || env.SALLY_WORKSPACE_SLUG || 'release-validation',
    tokenFile: readFlag(argv, '--token-file') || env.SALLY_WORKER_TOKEN_FILE || `${defaultStateDir}/${definition.defaultTokenFileName}`,
    cursorFile: readFlag(argv, '--cursor-file') || env.SALLY_WORKER_CURSOR_FILE || `${defaultStateDir}/${definition.defaultCursorFileName}`,
    workerName: readFlag(argv, '--name') || env.SALLY_WORKER_NAME || definition.defaultWorkerName,
    runtimeCommand: readFlag(argv, '--runtime-command') || readFlag(argv, definition.commandFlag) || env.SALLY_RUNTIME_COMMAND || env[definition.envCommand] || definition.defaultCommand,
    runtimeProfile,
    capabilities: readFlag(argv, '--capabilities') || env.SALLY_RUNTIME_CAPABILITIES || env[definition.envCapabilities],
    timeoutMs: readFlag(argv, '--timeout-ms') || env.SALLY_RUNTIME_TIMEOUT_MS || env[definition.envTimeoutMs],
    once: hasFlag(argv, '--once') || env.SALLY_WORKER_ONCE === '1',
    background: hasFlag(argv, '--background') || env.SALLY_WORKER_BACKGROUND === '1',
    pidFile: readFlag(argv, '--pid-file') || env.SALLY_WORKER_PID_FILE || `${defaultStateDir}/${runtimeArg}-worker.pid`,
    logFile: readFlag(argv, '--log-file') || env.SALLY_WORKER_LOG_FILE || `${defaultStateDir}/${runtimeArg}-worker.log`,
    installService: hasFlag(argv, 'install-service') || hasFlag(argv, '--install-service'),
  }
}

export function toHermesConnectorArgs(args: AgentConnectArgs) {
  const definition = getRuntimeDefinition(args.runtime)
  const result = [
    ...(args.pairingCode ? ['--pairing-code', args.pairingCode] : []),
    '--base-url', args.apiBaseUrl,
    '--workspace-slug', args.workspaceSlug,
    '--token-file', args.tokenFile,
    '--cursor-file', args.cursorFile,
    '--name', args.workerName,
    '--runtime-command', args.runtimeCommand,
  ]
  if (args.workspaceId) result.push('--workspace-id', args.workspaceId)
  if (args.runtimeProfile) result.push(definition.profileFlag || '--runtime-profile', args.runtimeProfile)
  if (args.capabilities) result.push('--capabilities', args.capabilities)
  if (args.timeoutMs) result.push('--timeout-ms', args.timeoutMs)
  if (args.background) result.push('--background')
  if (args.pidFile) result.push('--pid-file', args.pidFile)
  if (args.logFile) result.push('--log-file', args.logFile)
  if (args.once) result.push('--once')
  return result
}
