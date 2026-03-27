'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addProjectMember, createTask, getWorkspaceMembers, inviteWorkspaceMember, updateTask } from '../lib/api'
import { getWorkspaceId } from '../lib/auth'
import { qk, useProjectQuery } from '../lib/query'
import { labelText, projectInputField } from '../lib/theme'

const ADD_NEW_VALUE = '__invite_new__'

type AssigneePickerProps = {
  projectId: string
  taskId?: string
  value: string
  onChange?: (value: string) => void
  onSaved?: (value: string) => void
  placeholder?: string
  canManage?: boolean
}

export function AssigneePicker({ projectId, taskId, value, onChange, onSaved, placeholder = 'Unassigned', canManage = true }: AssigneePickerProps) {
  const qc = useQueryClient()
  const { data: project } = useProjectQuery(projectId)
  const [workspaceMembers, setWorkspaceMembers] = useState<{ id: string; accountId: string; name: string | null; email: string; role: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [inviteMode, setInviteMode] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = useMemo(() => {
    const names = workspaceMembers.map((member) => ({ value: member.name || member.email, label: member.name ? `${member.name} · ${member.email}` : member.email }))
    const unique = new Map<string, string>()
    for (const option of names) if (option.value) unique.set(option.value, option.label)
    return Array.from(unique, ([value, label]) => ({ value, label }))
  }, [workspaceMembers])

  async function ensureWorkspaceMembersLoaded() {
    if (loaded) return
    const workspaceId = getWorkspaceId()
    if (!workspaceId) {
      setLoaded(true)
      return
    }
    const members = await getWorkspaceMembers(workspaceId).catch(() => [])
    setWorkspaceMembers(members)
    setLoaded(true)
  }

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
    ])
  }

  async function persist(nextValue: string) {
    setSaving(true)
    setError(null)
    try {
      if (taskId) {
        await updateTask(taskId, { assignee: nextValue || 'Unassigned' })
      }
      await refreshAll()
      onSaved?.(nextValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignee')
    } finally {
      setSaving(false)
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || saving) return
    try {
      setSaving(true)
      setError(null)
      await inviteWorkspaceMember({ email, role: 'MEMBER' })
      await addProjectMember(projectId, { email, role: 'MEMBER' })
      if (taskId) await updateTask(taskId, { assignee: email })
      setInviteEmail('')
      setInviteMode(false)
      await refreshAll()
      onSaved?.(email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite assignee')
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return <div style={{ ...projectInputField, cursor: 'default' }}>{value || placeholder}</div>
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {!inviteMode ? (
        <select
          value={value}
          onFocus={() => void ensureWorkspaceMembersLoaded()}
          onChange={(event) => {
            const next = event.target.value
            if (next === ADD_NEW_VALUE) {
              setInviteMode(true)
              return
            }
            onChange?.(next)
            void persist(next)
          }}
          disabled={saving}
          style={projectInputField}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value={ADD_NEW_VALUE}>Invite new person…</option>
        </select>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" style={projectInputField} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void handleInvite()} disabled={!inviteEmail.trim() || saving} style={smallActionBtn}>{saving ? 'Inviting…' : 'Invite + assign'}</button>
            <button type="button" onClick={() => { setInviteMode(false); setInviteEmail(''); setError(null) }} style={ghostBtn}>Cancel</button>
          </div>
        </div>
      )}
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 12 }}>{error}</div> : null}
    </div>
  )
}

const smallActionBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '8px 12px', fontWeight: 700, whiteSpace: 'nowrap' }
const ghostBtn: React.CSSProperties = { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '8px 12px', fontWeight: 600 }
