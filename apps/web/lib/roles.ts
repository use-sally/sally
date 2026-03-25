export const workspaceRoleOptions = [
  { value: 'OWNER', label: 'Owner', help: 'Full control inside this workspace. Can see every project in this workspace.' },
  { value: 'MEMBER', label: 'Member', help: 'Regular workspace access. Only sees projects they are part of.' },
  { value: 'VIEWER', label: 'Viewer', help: 'Read-only workspace access. Only sees projects they are part of.' },
] as const

export function platformRoleLabel(role?: string | null) {
  return role === 'SUPERADMIN' ? 'Superadmin' : role || 'User'
}

export const projectRoleOptions = [
  { value: 'OWNER', label: 'Owner', help: 'Owns and manages this specific project.' },
  { value: 'MEMBER', label: 'Member', help: 'Works inside this specific project.' },
  { value: 'VIEWER', label: 'Viewer', help: 'Read-only access to this specific project.' },
] as const

export function workspaceRoleLabel(role?: string | null) {
  return workspaceRoleOptions.find((option) => option.value === role)?.label || role || 'Unknown role'
}

export function workspaceRoleHelp(role?: string | null) {
  return workspaceRoleOptions.find((option) => option.value === role)?.help || ''
}

export function projectRoleLabel(role?: string | null) {
  return projectRoleOptions.find((option) => option.value === role)?.label || role || 'Unknown role'
}

export function projectRoleHelp(role?: string | null) {
  return projectRoleOptions.find((option) => option.value === role)?.help || ''
}
