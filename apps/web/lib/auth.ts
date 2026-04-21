export type Membership = { id: string; workspaceId: string; workspaceSlug?: string; workspaceName: string; role: string }
export type AuthAccount = { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'SUPERADMIN' }
export type AuthSession = {
  token: string
  expiresAt?: string
  account?: AuthAccount
  memberships?: Membership[]
}

const SESSION_KEY = 'atpm.session'
const WORKSPACE_KEY = 'atpm.workspaceId'
const CONFIGURED_WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || null
const CONFIGURED_WORKSPACE_SLUG = process.env.NEXT_PUBLIC_WORKSPACE_SLUG || null

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadSession(): AuthSession | null {
  if (!hasWindow()) return null
  const raw = window.localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.token) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession) {
  if (!hasWindow()) return
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  if (!hasWindow()) return
  window.localStorage.removeItem(SESSION_KEY)
}

export function getSessionToken() {
  return loadSession()?.token
}

export function getWorkspaceId() {
  if (!hasWindow()) return null
  return window.localStorage.getItem(WORKSPACE_KEY)
}

export function pickPreferredWorkspaceId(
  memberships: Membership[],
  options?: { requestedWorkspaceId?: string | null; storedWorkspaceId?: string | null; configuredWorkspaceId?: string | null; configuredWorkspaceSlug?: string | null },
) {
  const requestedWorkspaceId = options?.requestedWorkspaceId?.trim() || null
  if (requestedWorkspaceId && memberships.some((membership) => membership.workspaceId === requestedWorkspaceId)) return requestedWorkspaceId

  const configuredWorkspaceId = options?.configuredWorkspaceId?.trim() || CONFIGURED_WORKSPACE_ID
  if (configuredWorkspaceId && memberships.some((membership) => membership.workspaceId === configuredWorkspaceId)) return configuredWorkspaceId

  const configuredWorkspaceSlug = options?.configuredWorkspaceSlug?.trim() || CONFIGURED_WORKSPACE_SLUG
  if (configuredWorkspaceSlug) {
    const configuredMembership = memberships.find((membership) => membership.workspaceSlug === configuredWorkspaceSlug)
    if (configuredMembership) return configuredMembership.workspaceId
  }

  const storedWorkspaceId = options?.storedWorkspaceId?.trim() || getWorkspaceId()
  if (storedWorkspaceId && memberships.some((membership) => membership.workspaceId === storedWorkspaceId)) return storedWorkspaceId

  return memberships[0]?.workspaceId || null
}

export function setWorkspaceId(workspaceId: string | null) {
  if (!hasWindow()) return
  if (!workspaceId) {
    window.localStorage.removeItem(WORKSPACE_KEY)
    return
  }
  window.localStorage.setItem(WORKSPACE_KEY, workspaceId)
}
