export type PermissionDecision = {
  visible: boolean
  allowed: boolean
}

export type TimesheetPermissionViewer = {
  timesheetUserId?: string | null
  platformRole?: string | null
  workspaceRole?: string | null
  projectRole?: string | null
}

export type TimesheetPermissionEntry = {
  userId?: string | null
  validated?: boolean
}

function decision(allowed: boolean): PermissionDecision {
  return { visible: allowed, allowed }
}

export function canViewTimesheets(viewer: TimesheetPermissionViewer): PermissionDecision {
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.workspaceRole === 'OWNER') return decision(true)
  if (viewer.projectRole === 'OWNER' || viewer.projectRole === 'MEMBER') return decision(true)
  return decision(false)
}

export function canAddTimesheet(viewer: TimesheetPermissionViewer): PermissionDecision {
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.projectRole === 'OWNER' || viewer.projectRole === 'MEMBER') return decision(true)
  return decision(false)
}

export function canEditTimesheet(viewer: TimesheetPermissionViewer, entry: TimesheetPermissionEntry): PermissionDecision {
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.projectRole === 'OWNER') return decision(true)
  if (viewer.projectRole === 'MEMBER' && viewer.timesheetUserId && entry.userId === viewer.timesheetUserId && !entry.validated) return decision(true)
  return decision(false)
}

export function canDeleteTimesheet(viewer: TimesheetPermissionViewer, entry: TimesheetPermissionEntry): PermissionDecision {
  return canEditTimesheet(viewer, entry)
}

export function canValidateTimesheet(viewer: TimesheetPermissionViewer): PermissionDecision {
  if (viewer.platformRole === 'SUPERADMIN') return decision(true)
  if (viewer.projectRole === 'OWNER') return decision(true)
  return decision(false)
}
