export type TaskPersonRole = 'OWNER' | 'PARTICIPANT'

export type TaskPersonRow = {
  participant: string
  role: TaskPersonRole
  position: number
}

type RawTaskParticipant =
  | string
  | {
      participant: string
      role?: TaskPersonRole | null
      position?: number | null
    }

function normalizeIdentity(value?: string | null) {
  const normalized = value?.trim()
  if (!normalized || normalized === 'Unassigned') return null
  return normalized
}

function normalizeParticipantList(participants?: RawTaskParticipant[] | null) {
  return (participants || [])
    .map((value) => {
      if (typeof value === 'string') return { participant: normalizeIdentity(value), role: null as TaskPersonRole | null, position: null as number | null }
      return {
        participant: normalizeIdentity(value?.participant),
        role: value?.role ?? null,
        position: value?.position ?? null,
      }
    })
    .filter((value): value is { participant: string; role: TaskPersonRole | null; position: number | null } => Boolean(value.participant))
}

export function normalizeTaskPeople(owner?: string | null, participants?: RawTaskParticipant[] | null) {
  const normalizedOwner = normalizeIdentity(owner)
  const normalizedParticipants = normalizeParticipantList(participants)
  const ordered = normalizedParticipants
    .sort((left, right) => {
      const leftOwner = left.role === 'OWNER' ? 0 : 1
      const rightOwner = right.role === 'OWNER' ? 0 : 1
      if (leftOwner !== rightOwner) return leftOwner - rightOwner
      return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER)
    })
    .map((value) => value.participant)

  const finalOwner = normalizedOwner ?? ordered[0] ?? null
  const deduped = Array.from(new Set([finalOwner, ...ordered].filter(Boolean) as string[]))
  const people = deduped.map((participant, index) => ({
    participant,
    role: (index === 0 ? 'OWNER' : 'PARTICIPANT') as TaskPersonRole,
    position: index,
  }))

  return {
    owner: finalOwner,
    people,
  }
}

export function buildLegacyTaskPeopleAliases(participants?: RawTaskParticipant[] | null) {
  const normalized = normalizeTaskPeople(undefined, participants)
  return {
    assignee: normalized.owner,
    collaborators: normalized.people.slice(1).map((person) => person.participant),
  }
}

export function buildTaskParticipantWrites(input: {
  owner?: string | null
  participants?: RawTaskParticipant[] | null
  assignee?: string | null
  collaborators?: string[] | null
}) {
  const normalized = normalizeTaskPeople(
    input.owner ?? input.assignee,
    input.participants ?? input.collaborators,
  )
  const legacyAliases = buildLegacyTaskPeopleAliases(normalized.people)

  return {
    owner: normalized.owner,
    assignee: legacyAliases.assignee,
    collaborators: legacyAliases.collaborators,
    participantRows: normalized.people,
    participantCreateMany: {
      data: normalized.people.map((person) => ({
        participant: person.participant,
        role: person.role,
        position: person.position,
      })),
    },
  }
}

export function resolveVisibleTaskPeople(input: {
  owner?: string | null
  participants?: RawTaskParticipant[] | null
  assignee?: string | null
  collaborators?: Array<string | { collaborator: string }> | null
}) {
  const canonicalParticipants = normalizeParticipantList(input.participants)
  if (canonicalParticipants.length || normalizeIdentity(input.owner)) {
    const normalized = normalizeTaskPeople(input.owner, canonicalParticipants)
    const legacyAliases = buildLegacyTaskPeopleAliases(normalized.people)
    return {
      owner: normalized.owner,
      participants: normalized.people,
      assignee: legacyAliases.assignee,
      collaborators: legacyAliases.collaborators,
    }
  }

  const legacyCollaborators = (input.collaborators || []).map((value) => typeof value === 'string' ? value : value.collaborator)
  const normalized = normalizeTaskPeople(input.assignee, legacyCollaborators)
  const legacyAliases = buildLegacyTaskPeopleAliases(normalized.people)
  return {
    owner: normalized.owner,
    participants: normalized.people,
    assignee: legacyAliases.assignee,
    collaborators: legacyAliases.collaborators,
  }
}
