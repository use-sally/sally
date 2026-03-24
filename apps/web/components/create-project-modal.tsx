'use client'

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { addProjectMember, createProject, getWorkspaceMembers } from '../lib/api'
import { qk } from '../lib/query'
import { getWorkspaceId } from '../lib/auth'
import { ClientPicker } from './client-picker'
import type { WorkspaceMember } from '@automatethis-pm/types/src'

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

  const selectedMemberSet = useMemo(() => new Set(selectedMemberIds), [selectedMemberIds])

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
          <label style={field}><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="Project name" /></label>
          <label style={field}><span>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 100, resize: 'vertical' }} /></label>
          <ClientPicker value={clientId} onChange={setClientId} />
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 700, color: '#334155' }}>Project members</div>
            {loadingMembers ? <div style={{ fontSize: 13, color: '#64748b' }}>Loading workspace members…</div> : null}
            {!loadingMembers && !workspaceMembers.length ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>No workspace members available.</div>
            ) : null}
            <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
              {workspaceMembers.map((member) => (
                <label key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#0f172a' }}>
                  <input
                    type="checkbox"
                    checked={selectedMemberSet.has(member.accountId)}
                    onChange={() => toggleMember(member.accountId)}
                  />
                  <span style={{ fontWeight: 600 }}>{member.name ?? '—'}</span>
                  <span style={{ color: '#64748b' }}>{member.email}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        {selectedMemberIds.length ? <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>Members will be added as project members after creation.</div> : null}
        {!selectedMemberIds.length ? <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>Select workspace members to add them to this project.</div> : null}
        {error ? <div style={{ color: '#991b1b', marginTop: 12 }}>{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={submit} style={primaryBtn} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create project'}</button>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'grid', placeItems: 'center', padding: 24 }
const modal: React.CSSProperties = { width: '100%', maxWidth: 560, background: '#fff', borderRadius: 20, padding: 22, boxShadow: '0 20px 50px rgba(15,23,42,0.18)' }
const field: React.CSSProperties = { display: 'grid', gap: 6, fontWeight: 600, color: '#334155' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 12px', background: '#fff', fontWeight: 500 }
const primaryBtn: React.CSSProperties = { background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
