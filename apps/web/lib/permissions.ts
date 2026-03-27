export type PermissionDecision = {
  visible: boolean
  allowed: boolean
}

export type ProjectPermissionViewer = {
  accountId?: string | null
  platformRole?: string | null
  workspaceRole?: string | null
  projectRole?: string | null
}

export type ProjectPermissionTarget = {
  accountId?: string | null
  role?: string | null
  locked?: boolean
}

export type ProjectPermissionContext = {
  archived?: boolean
  projectOwnerCount?: number
}

function decision(allowed: boolean): PermissionDecision {
  return { visible: allowed, allowed }
}

function roleRank(role?: string | null) {
  return role === 'OWNER' ? 2 : role === 'MEMBER' ? 1 : 0
}

export function canEditProject(viewer: ProjectPermissionViewer, context: ProjectPermissionContext = {}): PermissionDecision {
  if (context.archived) return decision(false)
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole === 'OWNER') return decision(true)
  if (viewer.projectRole === 'OWNER') return decision(true)
  return decision(false)
}

export function canChangeProjectClient(viewer: ProjectPermissionViewer, context: ProjectPermissionContext = {}): PermissionDecision {
  return canEditProject(viewer, context)
}

export function canManageProjectWorkflow(viewer: ProjectPermissionViewer, context: ProjectPermissionContext = {}): PermissionDecision {
  return canEditProject(viewer, context)
}

export function canAddProjectMember(viewer: ProjectPermissionViewer, context: ProjectPermissionContext = {}): PermissionDecision {
  return canEditProject(viewer, context)
}

export function canInviteProjectMember(viewer: ProjectPermissionViewer, context: ProjectPermissionContext = {}): PermissionDecision {
  return canEditProject(viewer, context)
}

export function canChangeProjectMemberRole(viewer: ProjectPermissionViewer, target: ProjectPermissionTarget, context: ProjectPermissionContext = {}): PermissionDecision {
  if (context.archived) return decision(false)
  if (target.locked) return decision(false)
  if (viewer.accountId && target.accountId === viewer.accountId) return decision(false)
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole === 'OWNER') return decision(true)
  if (viewer.projectRole === 'OWNER' && roleRank(viewer.projectRole) > roleRank(target.role)) return decision(true)
  return decision(false)
}

export function canRemoveProjectMember(viewer: ProjectPermissionViewer, target: ProjectPermissionTarget, context: ProjectPermissionContext = {}): PermissionDecision {
  if (context.archived) return decision(false)
  if (target.locked) return decision(false)
  if (viewer.accountId && target.accountId === viewer.accountId) return decision(false)
  if (target.role === 'OWNER' && (context.projectOwnerCount ?? 0) <= 1) return decision(false)
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole === 'OWNER') return decision(true)
  if (viewer.projectRole === 'OWNER' && roleRank(viewer.projectRole) > roleRank(target.role)) return decision(true)
  return decision(false)
}
