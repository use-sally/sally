import type { ProjectMember } from '@sally/types/src'

export type CollaboratorOption = {
  value: string
  label: string
  secondaryLabel: string
  selected: boolean
  missing: boolean
}

export function normalizeCollaboratorSelection(values: string[], assignee?: string | null) {
  const excluded = (assignee || '').trim()
  const unique = new Set<string>()
  const normalized: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (!value || value === excluded || unique.has(value)) continue
    unique.add(value)
    normalized.push(value)
  }
  return normalized
}

export function toggleCollaboratorSelection(current: string[], value: string) {
  const nextValue = value.trim()
  if (!nextValue) return [...current]
  return current.includes(nextValue)
    ? current.filter((item) => item !== nextValue)
    : [...current, nextValue]
}

export function buildCollaboratorOptions(members: ProjectMember[], selected: string[], assignee?: string | null): CollaboratorOption[] {
  const normalizedSelected = normalizeCollaboratorSelection(selected, assignee)
  const selectedSet = new Set(normalizedSelected)
  const excluded = (assignee || '').trim()
  const options = new Map<string, CollaboratorOption>()

  for (const member of members) {
    const value = (member.name || member.email || '').trim()
    if (!value || value === excluded || options.has(value)) continue
    options.set(value, {
      value,
      label: member.name ? `${member.name} · ${member.email}` : member.email,
      secondaryLabel: member.name ? member.email : 'Project member',
      selected: selectedSet.has(value),
      missing: false,
    })
  }

  for (const value of normalizedSelected) {
    if (options.has(value)) continue
    options.set(value, {
      value,
      label: value,
      secondaryLabel: 'Not on project',
      selected: true,
      missing: true,
    })
  }

  return Array.from(options.values()).sort((left, right) => {
    if (left.missing !== right.missing) return left.missing ? 1 : -1
    if (left.selected !== right.selected) return left.selected ? -1 : 1
    return left.label.localeCompare(right.label)
  })
}
