'use client'

import type { TaskCollaborator, TaskParticipant } from '@sally/types/src'
import { AssigneeAvatar } from './assignee-avatar'
import { getTaskPeopleSelection } from './task-people-helpers'

export type TaskPersonAvatar = { name: string; avatarUrl?: string | null }

export function TaskPeopleAvatarStack({
  owner,
  ownerAvatarUrl,
  participants = [],
  assignee,
  assigneeAvatarUrl,
  collaborators = [],
  size = 28,
  maxVisible = 3,
}: {
  owner?: string
  ownerAvatarUrl?: string | null
  participants?: TaskParticipant[] | TaskPersonAvatar[]
  assignee?: string
  assigneeAvatarUrl?: string | null
  collaborators?: TaskCollaborator[] | TaskPersonAvatar[]
  size?: number
  maxVisible?: number
}) {
  const canonicalOwner = owner ?? assignee ?? 'Unassigned'
  const canonicalOwnerAvatarUrl = ownerAvatarUrl ?? assigneeAvatarUrl ?? null
  const orderedNames = getTaskPeopleSelection(canonicalOwner, participants.length ? participants : collaborators)
  const avatarMap = new Map<string, string | null | undefined>()
  if (canonicalOwner && canonicalOwner !== 'Unassigned') avatarMap.set(canonicalOwner, canonicalOwnerAvatarUrl)
  for (const person of participants) {
    const name = ('participant' in person ? person.participant : person.name) as string
    avatarMap.set(name, person.avatarUrl)
  }
  for (const collaborator of collaborators) avatarMap.set(collaborator.name, collaborator.avatarUrl)

  const visibleNames = orderedNames.slice(0, maxVisible)
  const remainingCount = Math.max(0, orderedNames.length - visibleNames.length)

  if (!visibleNames.length) return <AssigneeAvatar name="Unassigned" size={size} />

  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: size }}>
      {visibleNames.map((name, index) => (
        <div key={name} style={{ marginLeft: index === 0 ? 0 : Math.round(size * -0.32), position: 'relative', zIndex: visibleNames.length - index }}>
          <AssigneeAvatar name={name} avatarUrl={avatarMap.get(name) ?? null} size={size} />
        </div>
      ))}
      {remainingCount ? (
        <div title={`+${remainingCount} more`} style={{ marginLeft: Math.round(size * -0.18), width: size, height: size, borderRadius: 999, border: '1px solid var(--form-border)', background: 'var(--panel-bg)', color: 'var(--text-primary)', display: 'grid', placeItems: 'center', fontSize: Math.max(10, Math.round(size * 0.34)), fontWeight: 700, zIndex: 0 }}>
          +{remainingCount}
        </div>
      ) : null}
    </div>
  )
}
