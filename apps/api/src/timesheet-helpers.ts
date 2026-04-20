export function chooseCreateTimesheetUserId({
  elevated,
  requestedUserId,
  currentUserId,
}: {
  elevated: boolean
  requestedUserId?: string | null
  currentUserId?: string | null
}) {
  const requested = requestedUserId?.trim() || null
  const current = currentUserId?.trim() || null
  if (!elevated) return current
  return requested || current
}
