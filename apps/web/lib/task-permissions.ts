export type TaskPermissionViewer = {
  platformRole?: string | null
  workspaceRole?: string | null
  projectRole?: string | null
}

export type PermissionDecision = {
  visible: boolean
  allowed: boolean
}

function decision(allowed: boolean): PermissionDecision {
  return { visible: allowed, allowed }
}

export function canEditTask(viewer: TaskPermissionViewer, archived = false): PermissionDecision {
  if (archived) return decision(false)
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole === 'OWNER') return decision(true)
  if (viewer.projectRole === 'OWNER' || viewer.projectRole === 'MEMBER') return decision(true)
  return decision(false)
}

export function canAssignTask(viewer: TaskPermissionViewer, archived = false): PermissionDecision {
  return canEditTask(viewer, archived)
}

export function canCreateTask(viewer: TaskPermissionViewer, archived = false): PermissionDecision {
  return canEditTask(viewer, archived)
}
