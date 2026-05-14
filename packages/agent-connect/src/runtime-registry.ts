export type SupportedAgentRuntime = 'hermes' | 'codex' | 'pi' | 'openclaw' | 'claude-code'

export type RuntimeDefinition = {
  id: SupportedAgentRuntime
  label: string
  defaultCommand: string
  defaultWorkerName: string
  defaultTokenFileName: string
  defaultCursorFileName: string
  defaultProfileRef: string
  defaultVersion: string
  commandFlag: string
  profileFlag?: string
  envCommand: string
  envProfile?: string
  envCapabilities: string
  envTimeoutMs: string
  availabilityArgs: string[]
  buildArgv(input: { profile?: string; prompt: string }): string[]
}

export const AGENT_RUNTIME_DEFINITIONS: Record<SupportedAgentRuntime, RuntimeDefinition> = {
  hermes: {
    id: 'hermes',
    label: 'Hermes',
    defaultCommand: 'hermes',
    defaultWorkerName: 'hermes-local-worker',
    defaultTokenFileName: 'hermes-worker-token',
    defaultCursorFileName: 'hermes-worker-cursor',
    defaultProfileRef: 'local-hermes',
    defaultVersion: 'hermes-local',
    commandFlag: '--hermes-command',
    profileFlag: '--hermes-profile',
    envCommand: 'SALLY_HERMES_COMMAND',
    envProfile: 'SALLY_HERMES_PROFILE',
    envCapabilities: 'SALLY_HERMES_CAPABILITIES',
    envTimeoutMs: 'SALLY_HERMES_TIMEOUT_MS',
    availabilityArgs: ['--version'],
    buildArgv: ({ profile, prompt }) => [
      ...(profile ? ['--profile', profile] : []),
      'chat',
      '--quiet',
      '-q',
      prompt,
    ],
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    defaultCommand: 'codex',
    defaultWorkerName: 'codex-local-worker',
    defaultTokenFileName: 'codex-worker-token',
    defaultCursorFileName: 'codex-worker-cursor',
    defaultProfileRef: 'local-codex',
    defaultVersion: 'codex-local',
    commandFlag: '--codex-command',
    profileFlag: '--codex-profile',
    envCommand: 'SALLY_CODEX_COMMAND',
    envProfile: 'SALLY_CODEX_PROFILE',
    envCapabilities: 'SALLY_CODEX_CAPABILITIES',
    envTimeoutMs: 'SALLY_CODEX_TIMEOUT_MS',
    availabilityArgs: ['--version'],
    buildArgv: ({ prompt }) => ['exec', '--skip-git-repo-check', prompt],
  },
  pi: {
    id: 'pi',
    label: 'Pi',
    defaultCommand: 'pi',
    defaultWorkerName: 'pi-local-worker',
    defaultTokenFileName: 'pi-worker-token',
    defaultCursorFileName: 'pi-worker-cursor',
    defaultProfileRef: 'local-pi',
    defaultVersion: 'pi-local',
    commandFlag: '--pi-command',
    envCommand: 'SALLY_PI_COMMAND',
    envCapabilities: 'SALLY_PI_CAPABILITIES',
    envTimeoutMs: 'SALLY_PI_TIMEOUT_MS',
    availabilityArgs: ['--version'],
    buildArgv: ({ prompt }) => [prompt],
  },
  openclaw: {
    id: 'openclaw',
    label: 'OpenClaw',
    defaultCommand: 'openclaw',
    defaultWorkerName: 'openclaw-local-worker',
    defaultTokenFileName: 'openclaw-worker-token',
    defaultCursorFileName: 'openclaw-worker-cursor',
    defaultProfileRef: 'local-openclaw',
    defaultVersion: 'openclaw-local',
    commandFlag: '--openclaw-command',
    profileFlag: '--openclaw-profile',
    envCommand: 'SALLY_OPENCLAW_COMMAND',
    envProfile: 'SALLY_OPENCLAW_PROFILE',
    envCapabilities: 'SALLY_OPENCLAW_CAPABILITIES',
    envTimeoutMs: 'SALLY_OPENCLAW_TIMEOUT_MS',
    availabilityArgs: ['--version'],
    buildArgv: ({ profile, prompt }) => [
      ...(profile ? ['--profile', profile] : []),
      'run',
      '--prompt',
      prompt,
    ],
  },
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    defaultCommand: 'claude',
    defaultWorkerName: 'claude-code-local-worker',
    defaultTokenFileName: 'claude-code-worker-token',
    defaultCursorFileName: 'claude-code-worker-cursor',
    defaultProfileRef: 'local-claude-code',
    defaultVersion: 'claude-code-local',
    commandFlag: '--claude-command',
    profileFlag: '--claude-profile',
    envCommand: 'SALLY_CLAUDE_COMMAND',
    envProfile: 'SALLY_CLAUDE_PROFILE',
    envCapabilities: 'SALLY_CLAUDE_CAPABILITIES',
    envTimeoutMs: 'SALLY_CLAUDE_TIMEOUT_MS',
    availabilityArgs: ['--version'],
    buildArgv: ({ prompt }) => ['--print', prompt],
  },
}

export const SUPPORTED_AGENT_RUNTIMES = Object.keys(AGENT_RUNTIME_DEFINITIONS) as SupportedAgentRuntime[]

export function isSupportedAgentRuntime(value: string): value is SupportedAgentRuntime {
  return Object.prototype.hasOwnProperty.call(AGENT_RUNTIME_DEFINITIONS, value)
}

export function getRuntimeDefinition(runtime: SupportedAgentRuntime) {
  return AGENT_RUNTIME_DEFINITIONS[runtime]
}
