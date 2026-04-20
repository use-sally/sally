export type TimesheetSelectableUser = { id: string; name: string }
export type SessionAccountIdentity = { name?: string | null; email?: string | null } | null | undefined

export function findCurrentTimesheetUserId(users: TimesheetSelectableUser[], account: SessionAccountIdentity): string | null {
  const accountName = account?.name?.trim().toLowerCase()
  const accountEmail = account?.email?.trim().toLowerCase()
  const match = users.find((user) => {
    const userName = user.name?.trim().toLowerCase()
    return Boolean(userName && ((accountName && userName === accountName) || (accountEmail && userName === accountEmail)))
  })
  return match?.id ?? null
}

export function getPreferredTimesheetCreateUserId(users: TimesheetSelectableUser[], account: SessionAccountIdentity): string {
  return findCurrentTimesheetUserId(users, account) ?? users[0]?.id ?? ''
}

export function getDefaultTimesheetUserName(account: SessionAccountIdentity): string {
  return account?.name?.trim() || account?.email?.trim() || 'Alex'
}
