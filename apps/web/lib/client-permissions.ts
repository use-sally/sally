export type ClientPermissionViewer = {
  platformRole?: string | null
  workspaceRole?: string | null
}

export type PermissionDecision = {
  visible: boolean
  allowed: boolean
}

function decision(allowed: boolean): PermissionDecision {
  return { visible: allowed, allowed }
}

export function canManageClients(viewer: ClientPermissionViewer): PermissionDecision {
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole === 'OWNER') return decision(true)
  return decision(false)
}
