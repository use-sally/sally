export type Membership = { id: string; workspaceId: string; workspaceName: string; role: string }
export type AuthAccount = { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'SUPERADMIN' }
export type AuthSession = {
  token: string
  expiresAt?: string
  account?: AuthAccount
  memberships?: Membership[]
}

const SESSION_KEY = 'atpm.session'
const WORKSPACE_KEY = 'atpm.workspaceId'

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

export function setWorkspaceId(workspaceId: string | null) {
  if (!hasWindow()) return
  if (!workspaceId) {
    window.localStorage.removeItem(WORKSPACE_KEY)
    return
  }
  window.localStorage.setItem(WORKSPACE_KEY, workspaceId)
}
