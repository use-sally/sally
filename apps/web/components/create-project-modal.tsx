'use client'

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { addProjectMember, createProject, getWorkspaceMembers } from '../lib/api'
import { qk } from '../lib/query'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { ClientPicker } from './client-picker'
import type { WorkspaceMember } from '@sally/types/src'
import { labelText, projectInputField } from '../lib/theme'

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  const session = useMemo(() => loadSession(), [])
  const selectedMemberSet = useMemo(() => new Set(selectedMemberIds), [selectedMemberIds])
  const defaultProjectMembers = useMemo(() => {
    const members = new Map<string, { accountId: string; name: string | null; email: string; note: string }>()
    const currentName = session?.account?.name || session?.account?.email || 'You'
    const currentEmail = session?.account?.email || '—'
    if (session?.account?.id) {
      members.set(session.account.id, { accountId: session.account.id, name: currentName, email: currentEmail, note: session.account.platformRole === 'SUPERADMIN' ? 'Project owner · Superadmin' : 'Project owner' })
    }
    workspaceMembers.filter((member) => member.role === 'OWNER').forEach((member) => {
      members.set(member.accountId, {
        accountId: member.accountId,
        name: member.name,
        email: member.email,
        note: member.accountId === session?.account?.id
          ? (session?.account?.platformRole === 'SUPERADMIN' ? 'Project owner · Workspace owner · Superadmin' : 'Project owner · Workspace owner')
          : 'Workspace owner',
      })
    })
    return Array.from(members.values())
  }, [session, workspaceMembers])
  const defaultProjectMemberIds = useMemo(() => new Set(defaultProjectMembers.map((member) => member.accountId)), [defaultProjectMembers])
  const availableProjectMembers = useMemo(() => workspaceMembers.filter((member) => !defaultProjectMemberIds.has(member.accountId)), [defaultProjectMemberIds, workspaceMembers])

  useEffect(() => {
    const workspaceId = getWorkspaceId()
    if (!workspaceId) return
    setLoadingMembers(true)
    getWorkspaceMembers(workspaceId)
      .then((data) => setWorkspaceMembers(data))
      .catch(() => setWorkspaceMembers([]))
      .finally(() => setLoadingMembers(false))
  }, [])

  async function submit() {
    try {
      setSaving(true)
      setError(null)
      const result = await createProject({ name, description, clientId: clientId || null })
      if (selectedMemberIds.length) {
        try {
          await Promise.all(selectedMemberIds.map((accountId) => addProjectMember(result.projectId, { accountId, role: 'MEMBER' })))
        } catch (memberError) {
          setError(memberError instanceof Error ? memberError.message : 'Project created, but failed to add members')
          return
        }
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: qk.projectsSummary }),
      ])
      onClose()
      router.push(`/projects/${result.projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  const toggleMember = (accountId: string) => {
    setSelectedMemberIds((current) => (current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]))
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 750 }}>New project</div>
          <button onClick={onClose} style={ghostBtn}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={field}><span style={labelText}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="Project name" /></label>
          <label style={field}><span style={labelText}>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 100, resize: 'vertical' }} /></label>
          <ClientPicker value={clientId} onChange={setClientId} />
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 700, color: 'rgba(209, 250, 229, 0.72)' }}>Always included</div>
            <div style={{ display: 'grid', gap: 6, border: '1px solid var(--panel-border)', borderRadius: 12, padding: 10 }}>
              {defaultProjectMembers.map((member) => (
                <div key={member.accountId} style={{ display: 'grid', gap: 2 }}>
                  <div style={{ fontWeight: 600 }}>{member.name ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{member.email} · {member.note}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 700, color: 'rgba(209, 250, 229, 0.72)' }}>Additional project members</div>
            {loadingMembers ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading workspace members…</div> : null}
            {!loadingMembers && !availableProjectMembers.length ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No additional workspace members available.</div>
            ) : null}
            <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflow: 'auto', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 10 }}>
              {availableProjectMembers.map((member) => (
                <label key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={selectedMemberSet.has(member.accountId)}
                    onChange={() => toggleMember(member.accountId)}
                  />
                  <span style={{ fontWeight: 600 }}>{member.name ?? '—'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{member.email}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        {selectedMemberIds.length ? <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>Members will be added as project members after creation.</div> : null}
        {!selectedMemberIds.length ? <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>Select workspace members to add them to this project.</div> : null}
        {error ? <div style={{ color: 'var(--danger-text)', marginTop: 12 }}>{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={submit} style={primaryBtn} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create project'}</button>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'grid', placeItems: 'center', padding: 24 }
const modal: React.CSSProperties = { width: '100%', maxWidth: 560, background: 'var(--form-bg)', borderRadius: 20, padding: 22, boxShadow: '0 20px 50px rgba(15,23,42,0.18)' }
const field: React.CSSProperties = { display: 'grid', gap: 6 }
const input: React.CSSProperties = { ...projectInputField, fontWeight: 500 }
const primaryBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--text-primary)', border: '1px solid var(--form-border)', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
