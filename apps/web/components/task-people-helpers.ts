import type { ProjectMember, TaskCollaborator, TaskParticipant } from '@sally/types/src'

function memberDisplayValue(member: ProjectMember) {
  return (member.name || member.email || '').trim()
}

function resolveMemberValue(members: ProjectMember[], rawValue: string) {
  const value = rawValue.trim()
  if (!value) return ''
  const directMatch = members.find((member) => memberDisplayValue(member) === value)
  if (directMatch) return memberDisplayValue(directMatch)
  const emailMatch = members.find((member) => member.email.trim().toLowerCase() === value.toLowerCase())
  if (emailMatch) return memberDisplayValue(emailMatch)
  const nameMatch = members.find((member) => member.name?.trim().toLowerCase() === value.toLowerCase())
  if (nameMatch) return memberDisplayValue(nameMatch)
  return value
}

export type TaskPersonRole = 'owner' | 'collaborator' | 'available'

export type TaskPersonOption = {
  value: string
  label: string
  secondaryLabel: string
  selected: boolean
  role: TaskPersonRole
  missing: boolean
}

export function normalizeTaskPeopleSelection(values: string[]) {
  const unique = new Set<string>()
  const normalized: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (!value || value === 'Unassigned' || unique.has(value)) continue
    unique.add(value)
    normalized.push(value)
  }
  return normalized
}

export function resolveTaskPeopleSelectionAgainstMembers(members: ProjectMember[], values: string[]) {
  return normalizeTaskPeopleSelection(values.map((value) => resolveMemberValue(members, value)))
}

export function getTaskPeopleSelection(
  ownerOrAssignee?: string | null,
  people: Array<TaskParticipant | TaskCollaborator | string> = [],
) {
  const ordered = [...people]
    .sort((left, right) => {
      const leftRole = typeof left === 'string' ? 1 : 'role' in left ? (left.role === 'OWNER' ? 0 : 1) : 1
      const rightRole = typeof right === 'string' ? 1 : 'role' in right ? (right.role === 'OWNER' ? 0 : 1) : 1
      if (leftRole !== rightRole) return leftRole - rightRole
      const leftPosition = typeof left === 'string' ? Number.MAX_SAFE_INTEGER : 'position' in left ? left.position : Number.MAX_SAFE_INTEGER
      const rightPosition = typeof right === 'string' ? Number.MAX_SAFE_INTEGER : 'position' in right ? right.position : Number.MAX_SAFE_INTEGER
      return leftPosition - rightPosition
    })
    .map((item) => (typeof item === 'string' ? item : 'participant' in item ? item.participant : item.name) as string)
  const entries = [ownerOrAssignee || '', ...ordered]
  return normalizeTaskPeopleSelection(entries)
}

export function buildTaskPeopleUpdate(selection: string[]) {
  const normalized = normalizeTaskPeopleSelection(selection)
  return {
    owner: normalized[0] || 'Unassigned',
    participants: normalized.map((participant, index) => ({ participant, role: index === 0 ? 'OWNER' as const : 'PARTICIPANT' as const, position: index })),
    assignee: normalized[0] || 'Unassigned',
    collaborators: normalized.slice(1),
  }
}

export function toggleTaskPersonSelection(current: string[], value: string) {
  const normalized = normalizeTaskPeopleSelection(current)
  const nextValue = value.trim()
  if (!nextValue) return normalized
  return normalized.includes(nextValue)
    ? normalized.filter((item) => item !== nextValue)
    : [...normalized, nextValue]
}

export function promoteTaskPersonSelection(current: string[], value: string) {
  const normalized = normalizeTaskPeopleSelection(current)
  const nextValue = value.trim()
  if (!nextValue || !normalized.includes(nextValue)) return normalized
  return [nextValue, ...normalized.filter((item) => item !== nextValue)]
}

export function buildTaskPeopleOptions(members: ProjectMember[], selection: string[]) {
  const normalizedSelection = resolveTaskPeopleSelectionAgainstMembers(members, selection)
  const selectedSet = new Set(normalizedSelection)
  const options = new Map<string, TaskPersonOption>()

  for (const member of members) {
    const value = (member.name || member.email || '').trim()
    if (!value || options.has(value)) continue
    const selectedIndex = normalizedSelection.indexOf(value)
    const role: TaskPersonRole = selectedIndex === 0 ? 'owner' : selectedIndex > 0 ? 'collaborator' : 'available'
    options.set(value, {
      value,
      label: member.name ? `${member.name} · ${member.email}` : member.email,
      secondaryLabel: role === 'owner' ? 'First person' : role === 'collaborator' ? 'Additional person' : 'Add to task',
      selected: selectedSet.has(value),
      role,
      missing: false,
    })
  }

  for (const value of normalizedSelection) {
    if (options.has(value)) continue
    const index = normalizedSelection.indexOf(value)
    const role: TaskPersonRole = index === 0 ? 'owner' : 'collaborator'
    options.set(value, {
      value,
      label: value,
      secondaryLabel: role === 'owner' ? 'First person' : 'Additional person',
      selected: true,
      role,
      missing: true,
    })
  }

  return Array.from(options.values()).sort((left, right) => {
    if (left.selected !== right.selected) return left.selected ? -1 : 1
    if (left.role !== right.role) return left.role === 'owner' ? -1 : right.role === 'owner' ? 1 : left.role === 'collaborator' ? -1 : 1
    if (left.missing !== right.missing) return left.missing ? 1 : -1
    return left.label.localeCompare(right.label)
  })
}
