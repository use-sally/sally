type AgentIdentityLike = { id?: string | null; [key: string]: unknown }
type ClipboardWriter = { writeText(text: string): Promise<void> | void }

export const AGENT_IDENTITY_EMPTY_STATE = 'Sally uses one connected local agent for the MVP. Planning, building, review, and testing are internal workflow modes, not separate user-facing agents.'

export function shouldShowAgentIdentityControls(_agents: AgentIdentityLike[]) {
  return false
}

export function buildHermesNpxConnectCommand(input: {
  pairingCode: string
  apiBaseUrl?: string | null
  workspaceId?: string | null
  workspaceSlug?: string | null
}) {
  const parts = ['npx', 'sally-agent-connect', 'hermes', '--pairing-code', input.pairingCode]
  if (input.apiBaseUrl) parts.push('--base-url', input.apiBaseUrl)
  if (input.workspaceId) parts.push('--workspace-id', input.workspaceId)
  if (input.workspaceSlug) parts.push('--workspace-slug', input.workspaceSlug)
  return parts.join(' ')
}

export async function copyHermesConnectCommandToClipboard(command: string, clipboard: ClipboardWriter | null | undefined) {
  if (!command.trim() || !clipboard?.writeText) return false
  await clipboard.writeText(command)
  return true
}
