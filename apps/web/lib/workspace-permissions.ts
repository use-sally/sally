export type PermissionDecision = {
  visible: boolean
  allowed: boolean
}

export type WorkspacePermissionViewer = {
  accountId?: string | null
  platformRole?: string | null
  workspaceRole?: string | null
}

export type WorkspacePermissionTarget = {
  accountId?: string | null
  role?: string | null
  invited?: boolean
}

function decision(allowed: boolean): PermissionDecision {
  return { visible: allowed, allowed }
}

function roleRank(role?: string | null) {
  return role === 'OWNER' ? 2 : role === 'MEMBER' ? 1 : 0
}

export function canInviteWorkspaceMembers(viewer: WorkspacePermissionViewer): PermissionDecision {
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole === 'OWNER') return decision(true)
  return decision(false)
}

export function canChangeWorkspaceMemberRole(viewer: WorkspacePermissionViewer, target: WorkspacePermissionTarget, nextRole?: string): PermissionDecision {
  if (target.invited) return decision(false)
  if (viewer.accountId && target.accountId === viewer.accountId) return decision(false)
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole !== 'OWNER') return decision(false)
  const requesterRank = roleRank(viewer.workspaceRole)
  const targetRank = roleRank(target.role)
  const nextRank = nextRole ? roleRank(nextRole) : 0
  return decision(requesterRank > targetRank && requesterRank > nextRank)
}

export function canRemoveWorkspaceMember(viewer: WorkspacePermissionViewer, target: WorkspacePermissionTarget): PermissionDecision {
  if (target.invited) return decision(false)
  if (viewer.accountId && target.accountId === viewer.accountId) return decision(false)
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole !== 'OWNER') return decision(false)
  return decision(roleRank(viewer.workspaceRole) > roleRank(target.role))
}

export function canManageWorkspaceInvite(viewer: WorkspacePermissionViewer): PermissionDecision {
  return canInviteWorkspaceMembers(viewer)
}
