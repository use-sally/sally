'use client'

import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectMember, TaskCollaborator, TaskParticipant } from '@sally/types/src'
import { useQueryClient } from '@tanstack/react-query'
import { addProjectMember, getProjectMembers, inviteWorkspaceMember, updateTask } from '../lib/api'
import { getWorkspaceId } from '../lib/auth'
import { qk } from '../lib/query'
import { projectInputField } from '../lib/theme'
import { TaskPeopleAvatarStack } from './task-people-avatar-stack'
import { buildTaskPeopleOptions, buildTaskPeopleUpdate, getTaskPeopleSelection, promoteTaskPersonSelection, resolveTaskPeopleSelectionAgainstMembers, toggleTaskPersonSelection } from './task-people-helpers'

type TaskPeopleFieldProps = {
  projectId: string
  taskId?: string
  owner?: string
  ownerAvatarUrl?: string | null
  participants?: TaskParticipant[]
  assignee?: string
  assigneeAvatarUrl?: string | null
  collaborators?: TaskCollaborator[]
  canManage?: boolean
  compact?: boolean
  onSaved?: (value: { owner: string; participants: { participant: string; role: 'OWNER' | 'PARTICIPANT'; position: number }[]; assignee: string; collaborators: string[] }) => void
}

export function TaskPeopleField({
  projectId,
  taskId,
  owner,
  ownerAvatarUrl,
  participants = [],
  assignee,
  assigneeAvatarUrl,
  collaborators = [],
  canManage = true,
  compact = false,
  onSaved,
}: TaskPeopleFieldProps) {
  const qc = useQueryClient()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteMode, setInviteMode] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const legacyOwner = owner ?? assignee ?? 'Unassigned'
  const legacyOwnerAvatarUrl = ownerAvatarUrl ?? assigneeAvatarUrl ?? null
  const [selection, setSelection] = useState<string[]>(() => getTaskPeopleSelection(legacyOwner, participants.length ? participants : collaborators))

  useEffect(() => {
    setSelection(resolveTaskPeopleSelectionAgainstMembers(members, getTaskPeopleSelection(legacyOwner, participants.length ? participants : collaborators)))
  }, [legacyOwner, participants, collaborators, members])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const options = useMemo(() => buildTaskPeopleOptions(members, selection), [members, selection])
  const firstPerson = selection[0] || 'Unassigned'
  const collaboratorLabels = selection.slice(1)
  const currentAvatarMap = useMemo(() => {
    const map = new Map<string, string | null | undefined>()
    if (legacyOwner && legacyOwner !== 'Unassigned') map.set(legacyOwner, legacyOwnerAvatarUrl)
    for (const person of participants) map.set(person.name, person.avatarUrl)
    for (const collaborator of collaborators) map.set(collaborator.name, collaborator.avatarUrl)
    for (const member of members) {
      const value = (member.name || member.email || '').trim()
      if (value && !map.has(value)) map.set(value, member.avatarUrl ?? null)
    }
    return map
  }, [legacyOwner, legacyOwnerAvatarUrl, participants, collaborators, members])
  const visibleAssignee = firstPerson
  const visibleCollaborators = collaboratorLabels.map((name) => ({ name, avatarUrl: currentAvatarMap.get(name) ?? null }))
  const ownerLabel = firstPerson === 'Unassigned' ? firstPerson : `First person · ${firstPerson}`

  async function ensureMembersLoaded() {
    if (loaded) return
    try {
      setError(null)
      setMembers(await getProjectMembers(projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project members')
    } finally {
      setLoaded(true)
    }
  }

  async function refreshAll() {
    await Promise.all([
      taskId ? qc.invalidateQueries({ queryKey: qk.task(taskId) }) : Promise.resolve(),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function persist(nextSelection: string[]) {
    const canonicalSelection = resolveTaskPeopleSelectionAgainstMembers(members, nextSelection)
    const nextPayload = buildTaskPeopleUpdate(canonicalSelection)
    setSaving(true)
    setError(null)
    try {
      if (taskId) await updateTask(taskId, nextPayload)
      setSelection(canonicalSelection)
      await refreshAll()
      onSaved?.(nextPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task people')
    } finally {
      setSaving(false)
    }
  }

  async function togglePerson(value: string) {
    if (!canManage || saving) return
    await persist(toggleTaskPersonSelection(selection, value))
  }

  async function promotePerson(value: string) {
    if (!canManage || saving) return
    await persist(promoteTaskPersonSelection(selection, value))
  }

  async function openMenu() {
    if (!open) await ensureMembersLoaded()
    setInviteMode(false)
    setInviteEmail('')
    setOpen((current) => !current)
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || saving) return
    const workspaceId = getWorkspaceId()
    if (!workspaceId) {
      setError('Workspace context missing')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await inviteWorkspaceMember({ email, role: 'MEMBER' })
      await addProjectMember(projectId, { email, role: 'MEMBER' })
      const refreshedMembers = await getProjectMembers(projectId)
      setMembers(refreshedMembers)
      setLoaded(true)
      const resolvedValue = resolveTaskPeopleSelectionAgainstMembers(refreshedMembers, [email])[0] || email
      await persist([...selection, resolvedValue])
      setInviteEmail('')
      setInviteMode(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite user')
      setSaving(false)
    }
  }

  const trigger = (
    <button
      type="button"
      onClick={() => void openMenu()}
      disabled={saving}
      aria-expanded={open}
      style={compact ? compactTrigger : fullTrigger}
      title={selection.length ? `${firstPerson}${collaboratorLabels.length ? ` + ${collaboratorLabels.length} additional ${collaboratorLabels.length === 1 ? 'person' : 'people'}` : ''}` : 'Assign people'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 0 : 10, minWidth: 0, width: '100%' }}>
        <TaskPeopleAvatarStack assignee={visibleAssignee} assigneeAvatarUrl={currentAvatarMap.get(visibleAssignee) ?? null} collaborators={visibleCollaborators} size={compact ? 28 : 30} />
        {!compact ? (
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{ownerLabel}</div>
            <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {collaboratorLabels.length ? `${collaboratorLabels.join(', ')}` : 'Click to add more people'}
            </div>
          </div>
        ) : null}
      </div>
      {!compact ? <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{open ? '−' : '+'}</span> : null}
    </button>
  )

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', display: 'grid', gap: 8 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {compact ? (
        <div style={{ position: 'relative', width: 'fit-content' }}>
          {trigger}
          {canManage && (hovered || open) ? (
            <button type="button" onClick={() => void openMenu()} disabled={saving} style={compactBadgeButton} aria-label="Edit task people">
              {open ? '×' : '+'}
            </button>
          ) : null}
        </div>
      ) : trigger}

      {!compact && collaboratorLabels.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {collaboratorLabels.map((label) => <span key={label} style={personFlag}>{label}</span>)}
        </div>
      ) : null}

      {open ? (
        <div style={compact ? compactMenu : fullMenu}>
          {!inviteMode ? (
            <>
              <div style={{ display: 'grid', gap: 4 }}>
                {options.map((option) => {
                  const member = members.find((entry) => (entry.name || entry.email) === option.value || entry.email === option.value)
                  return (
                    <div key={option.value} style={{ ...optionRow, ...(option.selected ? optionRowSelected : null) }}>
                      <button type="button" onClick={() => void togglePerson(option.value)} disabled={saving} style={optionButton}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <TaskPeopleAvatarStack assignee={option.value} assigneeAvatarUrl={member?.avatarUrl ?? null} collaborators={[]} size={24} maxVisible={1} />
                          <div style={{ minWidth: 0, textAlign: 'left' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{option.label}</div>
                            <div style={{ marginTop: 2, fontSize: 11, color: option.selected ? 'rgba(5, 46, 22, 0.76)' : 'var(--text-muted)' }}>{option.secondaryLabel}</div>
                          </div>
                        </div>
                        <span style={{ color: option.selected ? '#052e16' : 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>
                          {option.role === 'owner' ? 'FIRST' : option.selected ? 'ON' : 'ADD'}
                        </span>
                      </button>
                      {option.role === 'collaborator' ? (
                        <button type="button" onClick={() => void promotePerson(option.value)} disabled={saving} style={promoteButton}>Make first person</button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              {canManage ? <button type="button" onClick={() => { setInviteMode(true); setError(null) }} disabled={saving} style={inviteButton}>Invite new user…</button> : null}
            </>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" style={inviteInput} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => void handleInvite()} disabled={!inviteEmail.trim() || saving} style={inviteButton}>{saving ? 'Inviting…' : 'Invite + add to task'}</button>
                <button type="button" onClick={() => { setInviteMode(false); setInviteEmail(''); setError(null) }} disabled={saving} style={cancelButton}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 12 }}>{error}</div> : null}
    </div>
  )
}

const fullTrigger: React.CSSProperties = {
  ...projectInputField,
  borderRadius: 12,
  padding: '10px 12px',
  fontWeight: 700,
  outline: 'none',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  cursor: 'pointer',
}

const compactTrigger: React.CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}

const compactBadgeButton: React.CSSProperties = {
  position: 'absolute',
  right: -8,
  bottom: -4,
  width: 18,
  height: 18,
  borderRadius: 999,
  border: '1px solid var(--form-border)',
  background: 'var(--panel-bg)',
  color: 'var(--text-primary)',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
}

const fullMenu: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  zIndex: 30,
  border: '1px solid var(--panel-border)',
  borderRadius: 14,
  background: 'var(--panel-bg)',
  boxShadow: 'var(--panel-shadow)',
  padding: 10,
  display: 'grid',
  gap: 6,
}

const compactMenu: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  zIndex: 30,
  minWidth: 280,
  border: '1px solid var(--panel-border)',
  borderRadius: 14,
  background: 'var(--panel-bg)',
  boxShadow: 'var(--panel-shadow)',
  padding: 10,
  display: 'grid',
  gap: 6,
}

const optionRow: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: 8,
  borderRadius: 10,
  border: '1px solid transparent',
}

const optionRowSelected: React.CSSProperties = {
  border: '1px solid rgba(250, 204, 21, 0.5)',
  background: '#fcd34d',
  color: '#052e16',
}

const optionButton: React.CSSProperties = {
  width: '100%',
  padding: 0,
  background: 'transparent',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  cursor: 'pointer',
  color: 'inherit',
}

const promoteButton: React.CSSProperties = {
  justifySelf: 'start',
  border: '1px solid currentColor',
  borderRadius: 999,
  background: 'transparent',
  color: 'inherit',
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
}

const inviteButton: React.CSSProperties = {
  justifySelf: 'start',
  border: '1px solid var(--form-border)',
  borderRadius: 999,
  background: 'var(--form-bg)',
  color: 'var(--form-text)',
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
}

const cancelButton: React.CSSProperties = {
  justifySelf: 'start',
  border: '1px solid var(--form-border)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--text-secondary)',
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
}

const inviteInput: React.CSSProperties = {
  ...projectInputField,
  borderRadius: 10,
  padding: '8px 10px',
}

const personFlag: React.CSSProperties = {
  borderRadius: 999,
  border: '1px solid var(--form-border)',
  padding: '4px 10px',
  background: 'var(--form-bg)',
  color: 'var(--form-text)',
  fontSize: 11,
  fontWeight: 700,
}
