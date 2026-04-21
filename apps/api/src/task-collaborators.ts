export function normalizeTaskCollaborators(collaborators?: string[], primaryAssignee?: string | null): string[] {
  const assignee = primaryAssignee?.trim()
  return Array.from(
    new Set(
      (collaborators || [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value && value !== 'Unassigned' && value !== assignee)),
    ),
  )
}

export function canAccessTaskParticipants(
  scope: { restricted: boolean; allowedAssignees: string[] },
  assignee?: string | null,
  collaborators?: string[] | null,
) {
  if (!scope.restricted) return true
  const allowed = new Set(scope.allowedAssignees)
  if (assignee && allowed.has(assignee)) return true
  return (collaborators || []).some((value) => allowed.has(value))
}
