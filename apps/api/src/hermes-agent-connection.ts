export type HermesRuntimeConfig = {
  runtimes: {
    hermes: {
      enabled: true
      command: string
      defaultArgs: string[]
      allowedRepoPaths: string[]
      capabilities: string[]
      timeoutMs: number
    }
  }
}

export type HermesConnectionArgs = {
  pairingCode?: string
  apiBaseUrl: string
  workspaceId?: string
  workspaceSlug: string
  tokenFile: string
  cursorFile: string
  workerName: string
  hermesCommand: string
  hermesProfile?: string
  capabilities: string[]
  timeoutMs: number
  once: boolean
}

export function defaultHermesCapabilities() {
  return ['pm', 'architecture', 'planning', 'code', 'git', 'tools']
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

function splitCapabilities(value?: string) {
  const capabilities = (value ? value.split(',') : defaultHermesCapabilities()).map((item) => item.trim()).filter(Boolean)
  return [...new Set(capabilities)]
}

export function parseHermesConnectionArgs(argv: string[], env: Record<string, string | undefined> = process.env): HermesConnectionArgs {
  const home = env.HOME || process.cwd()
  return {
    pairingCode: readFlag(argv, '--pairing-code') || env.SALLY_PAIRING_CODE,
    apiBaseUrl: readFlag(argv, '--base-url') || env.SALLY_API_BASE_URL || 'http://localhost:4000',
    workspaceId: readFlag(argv, '--workspace-id') || env.SALLY_WORKSPACE_ID,
    workspaceSlug: readFlag(argv, '--workspace-slug') || env.SALLY_WORKSPACE_SLUG || 'release-validation',
    tokenFile: readFlag(argv, '--token-file') || env.SALLY_WORKER_TOKEN_FILE || `${home}/.sally/hermes-worker-token`,
    cursorFile: readFlag(argv, '--cursor-file') || env.SALLY_WORKER_CURSOR_FILE || `${home}/.sally/hermes-worker-cursor`,
    workerName: readFlag(argv, '--name') || env.SALLY_WORKER_NAME || 'hermes-local-worker',
    hermesCommand: readFlag(argv, '--hermes-command') || env.SALLY_HERMES_COMMAND || 'hermes',
    hermesProfile: readFlag(argv, '--hermes-profile') || env.SALLY_HERMES_PROFILE,
    capabilities: splitCapabilities(readFlag(argv, '--capabilities') || env.SALLY_HERMES_CAPABILITIES),
    timeoutMs: Number(readFlag(argv, '--timeout-ms') || env.SALLY_HERMES_TIMEOUT_MS || 1800000),
    once: hasFlag(argv, '--once') || env.SALLY_WORKER_ONCE === '1',
  }
}

export function buildHermesRuntimeConfig(input: { command?: string; capabilities?: string[]; timeoutMs?: number } = {}): HermesRuntimeConfig {
  return {
    runtimes: {
      hermes: {
        enabled: true,
        command: input.command || 'hermes',
        defaultArgs: [],
        allowedRepoPaths: [],
        capabilities: input.capabilities?.length ? input.capabilities : defaultHermesCapabilities(),
        timeoutMs: input.timeoutMs ?? 1800000,
      },
    },
  }
}

export function buildHermesWorkerEnv(input: {
  apiBaseUrl: string
  workerToken: string
  workspaceId?: string
  workspaceSlug: string
  cursorFile: string
  runtimeConfig: HermesRuntimeConfig
}) {
  const env: Record<string, string> = {
    SALLY_API_BASE_URL: input.apiBaseUrl,
    SALLY_API_KEY: input.workerToken,
    SALLY_WORKSPACE_SLUG: input.workspaceSlug,
    SALLY_WORKER_CURSOR_FILE: input.cursorFile,
    SALLY_RUNTIME_CONFIG: JSON.stringify(input.runtimeConfig),
  }
  if (input.workspaceId) env.SALLY_WORKSPACE_ID = input.workspaceId
  return env
}

export function safeConnectionSummary(input: { tokenFile: string; cursorFile: string; apiBaseUrl: string; workerToken?: string; connectionId?: string | null }) {
  return {
    apiBaseUrl: input.apiBaseUrl,
    tokenFile: input.tokenFile,
    cursorFile: input.cursorFile,
    connectionId: input.connectionId ?? null,
    workerToken: input.workerToken ? '[REDACTED]' : undefined,
  }
}
