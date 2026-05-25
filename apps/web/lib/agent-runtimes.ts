export type AgentRuntimeId = 'hermes' | 'codex' | 'pi' | 'openclaw' | 'claude-code' | 'opencode'

export type AgentRuntimeOption = {
  id: AgentRuntimeId
  label: string
  description: string
  commandHint: string
}

export const AGENT_RUNTIME_OPTIONS: AgentRuntimeOption[] = [
  {
    id: 'hermes',
    label: 'Hermes',
    description: 'Local Hermes Agent runtime for Sally-native project workflows.',
    commandHint: 'hermes',
  },
  {
    id: 'codex',
    label: 'Codex',
    description: 'OpenAI Codex CLI for code-heavy implementation and review work.',
    commandHint: 'codex',
  },
  {
    id: 'pi',
    label: 'Pi',
    description: 'Pi runtime connector for conversational agent work.',
    commandHint: 'pi',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    description: 'OpenClaw runtime connector for OpenClaw worker profiles.',
    commandHint: 'openclaw',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'Claude Code CLI for autonomous coding tasks and project changes.',
    commandHint: 'claude',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    description: 'OpenCode CLI for coding tasks and project changes.',
    commandHint: 'opencode',
  },
]

export function getAgentRuntimeOption(runtime: string | null | undefined) {
  return AGENT_RUNTIME_OPTIONS.find((option) => option.id === runtime) ?? AGENT_RUNTIME_OPTIONS[0]
}
