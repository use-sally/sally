'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { addProjectMember, archiveProject, deleteProject, getProjectMembers, getWorkspaceMembers, removeProjectMember, updateProject, updateProjectMember } from '../lib/api'
import { qk } from '../lib/query'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { projectRoleHelp, projectRoleLabel, projectRoleOptions } from '../lib/roles'
import { ClientPicker } from './client-picker'
import type { ProjectMember, WorkspaceMember } from '@sally/types/src'
import { archiveTextAction, deleteTextAction } from '../lib/theme'

type EditProjectModalProps = {
  projectId: string
  initialName: string
  initialDescription?: string | null
  initialClientId?: string | null
  onClose: () => void
}

function projectRoleRank(role?: string | null) {
  if (role === 'OWNER') return 3
  if (role === 'MEMBER') return 2
  if (role === 'VIEWER') return 1
  return 0
}

export function EditProjectModal({ projectId, initialName, initialDescription, initialClientId, onClose }: EditProjectModalProps) {
  const qc = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription || '')
  const [clientId, setClientId] = useState(initialClientId || '')
  const [saving, setSaving] = useState(false)
  const [savingAction, setSavingAction] = useState<'save' | 'archive' | 'delete' | 'member-add' | 'member-remove' | 'member-role' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [selectedWorkspaceMemberId, setSelectedWorkspaceMemberId] = useState<string>('')

  const session = useMemo(() => loadSession(), [])
  const activeWorkspaceRole = useMemo(() => {
    const workspaceId = getWorkspaceId()
    return session?.memberships?.find((item) => item.workspaceId === workspaceId)?.role ?? session?.memberships?.[0]?.role
  }, [session])
  const isSuperadmin = session?.account?.platformRole === 'SUPERADMIN'

  const availableWorkspaceMembers = useMemo(() => {
    const projectMemberIds = new Set(projectMembers.map((member) => member.accountId))
    return workspaceMembers.filter((member) => !projectMemberIds.has(member.accountId))
  }, [projectMembers, workspaceMembers])

  useEffect(() => {
    const workspaceId = getWorkspaceId()
    if (!workspaceId) return
    setLoadingMembers(true)
    Promise.all([getWorkspaceMembers(workspaceId), getProjectMembers(projectId)])
      .then(([workspace, project]) => {
        setWorkspaceMembers(workspace)
        setProjectMembers(project)
        if (workspace.length && !selectedWorkspaceMemberId) {
          const available = workspace.filter((member) => !project.some((entry) => entry.accountId === member.accountId))
          setSelectedWorkspaceMemberId(available[0]?.accountId ?? '')
        }
      })
      .catch(() => {
        setWorkspaceMembers([])
        setProjectMembers([])
      })
      .finally(() => setLoadingMembers(false))
  }, [projectId])

  async function submit() {
    try {
      setSaving(true)
      setSavingAction('save')
      setError(null)
      await updateProject(projectId, { name, description, clientId: clientId || null })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(projectId) }),
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: qk.projectsSummary }),
      ])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project')
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  async function handleArchive() {
    if (typeof window !== 'undefined' && !window.confirm('Archive this project? You can restore it later.')) return
    try {
      setSaving(true)
      setSavingAction('archive')
      setError(null)
      await archiveProject(projectId)
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(projectId) }),
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: qk.projectsSummary }),
      ])
      onClose()
      router.push('/projects')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive project')
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  async function handleDelete() {
    if (typeof window !== 'undefined' && !window.confirm('Delete this project and all tasks? This cannot be undone.')) return
    try {
      setSaving(true)
      setSavingAction('delete')
      setError(null)
      await deleteProject(projectId)
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.project(projectId) }),
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: qk.projectsSummary }),
      ])
      onClose()
      router.push('/projects')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  const handleAddMember = async () => {
    if (!selectedWorkspaceMemberId) return
    try {
      setSaving(true)
      setSavingAction('member-add')
      setError(null)
      await addProjectMember(projectId, { accountId: selectedWorkspaceMemberId, role: 'MEMBER' })
      const updated = await getProjectMembers(projectId)
      setProjectMembers(updated)
      const remaining = availableWorkspaceMembers.filter((member) => member.accountId !== selectedWorkspaceMemberId)
      setSelectedWorkspaceMemberId(remaining[0]?.accountId ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  const canManageProjectMemberRole = (member: ProjectMember, nextRole?: string) => {
    if (member.locked) return false
    const isSelf = session?.account?.id && member.accountId === session.account.id
    if (isSelf) return false
    if (isSuperadmin || activeWorkspaceRole === 'OWNER') return true
    const currentProjectRole = projectMembers.find((entry) => entry.accountId === session?.account?.id)?.role
    const requesterRank = projectRoleRank(currentProjectRole)
    const targetRank = projectRoleRank(member.role)
    const nextRank = nextRole ? projectRoleRank(nextRole) : 0
    return requesterRank > targetRank && requesterRank > nextRank
  }

  const canRemoveProjectMember = (member: ProjectMember) => {
    if (member.locked) return false
    return canManageProjectMemberRole(member)
  }

  const handleRoleChange = async (membershipId: string, role: string) => {
    try {
      setSaving(true)
      setSavingAction('member-role')
      setError(null)
      await updateProjectMember(projectId, membershipId, { role })
      const updated = await getProjectMembers(projectId)
      setProjectMembers(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member role')
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  const handleRemoveMember = async (membershipId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Remove this member from the project?')) return
    try {
      setSaving(true)
      setSavingAction('member-remove')
      setError(null)
      await removeProjectMember(projectId, membershipId)
      const updated = await getProjectMembers(projectId)
      setProjectMembers(updated)
      const available = workspaceMembers.filter((member) => !updated.some((entry) => entry.accountId === member.accountId))
      setSelectedWorkspaceMemberId((current) => current || available[0]?.accountId || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  return (
    <div style={overlay} onClick={() => { if (!saving) onClose() }}>
      <div style={modal} onClick={(event) => event.stopPropagation()}>
        <style>{`@keyframes projectActionSpin { from { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.12); } to { transform: rotate(360deg) scale(1); } } @keyframes projectActionPulse { 0% { opacity: 0.55; transform: scale(0.98); } 50% { opacity: 1; transform: scale(1.02); } 100% { opacity: 0.55; transform: scale(0.98); } }`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 750 }}>Edit project</div>
          <button onClick={onClose} style={iconBtn} aria-label="Close edit project modal">✕</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={field}><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} style={input} /></label>
          <label style={field}><span>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 100, resize: 'vertical' }} /></label>
          <ClientPicker value={clientId} onChange={setClientId} />
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 700, color: 'rgba(209, 250, 229, 0.72)' }}>Project access</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Project roles are separate from workspace roles. A project owner owns this project; a workspace owner controls this workspace; a superadmin can still see everything globally.</div>
            </div>
            {loadingMembers ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading members…</div> : null}
            <div style={{ display: 'grid', gap: 6, border: '1px solid var(--panel-border)', borderRadius: 12, padding: 10, maxHeight: 180, overflow: 'auto' }}>
              {projectMembers.map((member) => {
                const isSelf = session?.account?.id && member.accountId === session.account.id
                return (
                <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ fontWeight: 600 }}>{member.name ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{member.email} · {projectRoleLabel(member.role)}</div>
                    <div style={{ fontSize: 12, color: 'rgba(209, 250, 229, 0.34)' }}>{member.platformRole === 'SUPERADMIN' ? 'Superadmin access is always included.' : member.workspaceRole === 'OWNER' ? 'Workspace owners are always included.' : member.locked ? 'Project owners are always included.' : projectRoleHelp(member.role)}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                    {member.locked ? (
                      <span style={{ fontSize: 12, color: 'rgba(209, 250, 229, 0.42)' }}>Included</span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={(event) => void handleRoleChange(member.id, event.target.value)}
                        disabled={saving || !canManageProjectMemberRole(member, member.role)}
                        style={{ borderRadius: 10, border: '1px solid var(--form-border)', padding: '6px 8px', fontWeight: 600, background: 'var(--form-bg)', minWidth: 140 }}
                      >
                        {projectRoleOptions.filter((role) => canManageProjectMemberRole(member, role.value) || role.value === member.role).map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                      </select>
                    )}
                    <button
                      onClick={() => void handleRemoveMember(member.id)}
                      style={{ borderRadius: 10, border: '1px solid var(--form-border)', padding: '6px 10px', fontWeight: 700, background: 'var(--form-bg)', color: 'var(--text-primary)' }}
                      disabled={saving || !canRemoveProjectMember(member)}
                    >
                      {isSelf ? 'You' : member.locked ? 'Included' : 'Remove'}
                    </button>
                  </div>
                </div>
              )})}
              {!projectMembers.length && !loadingMembers ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No project members yet.</div> : null}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedWorkspaceMemberId}
                onChange={(event) => setSelectedWorkspaceMemberId(event.target.value)}
                style={{ borderRadius: 10, border: '1px solid var(--form-border)', padding: '8px 10px', fontWeight: 600, background: 'var(--form-bg)', minWidth: 220 }}
                disabled={!availableWorkspaceMembers.length || saving}
              >
                {!availableWorkspaceMembers.length ? <option value="">All workspace members added</option> : null}
                {availableWorkspaceMembers.map((member) => (
                  <option key={member.accountId} value={member.accountId}>{member.name ?? member.email}</option>
                ))}
              </select>
              <button
                onClick={() => void handleAddMember()}
                style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: 'none', borderRadius: 12, padding: '9px 12px', fontWeight: 700 }}
                disabled={saving || !availableWorkspaceMembers.length || !selectedWorkspaceMemberId}
              >
                Add member
              </button>
            </div>
          </div>
        </div>
        {error ? <div style={{ color: 'var(--danger-text)', marginTop: 12 }}>{error}</div> : null}
        {savingAction === 'archive' ? <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, animation: 'projectActionPulse 0.95s ease-in-out infinite' }}>Archiving project…</div> : null}
        {savingAction === 'delete' ? <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, animation: 'projectActionPulse 0.95s ease-in-out infinite' }}>Deleting project… this can take a bit if it has many tasks.</div> : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleArchive} style={archiveTextAction} disabled={saving} aria-label="Archive project" title="Archive project">{savingAction === 'archive' ? '…' : 'Archive'}</button>
            <button onClick={handleDelete} style={deleteTextAction} disabled={saving} aria-label="Delete project" title="Delete project">{savingAction === 'delete' ? '…' : 'Delete'}</button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submit} style={primaryBtn} disabled={saving || !name.trim()}>{savingAction === 'save' ? 'Saving…' : 'Save project'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 60 }
const modal: React.CSSProperties = { width: '100%', maxWidth: 560, background: 'var(--form-bg)', borderRadius: 20, padding: 22, boxShadow: '0 20px 50px rgba(15,23,42,0.18)' }
const field: React.CSSProperties = { display: 'grid', gap: 6, fontWeight: 600, color: 'rgba(209, 250, 229, 0.72)' }
const input: React.CSSProperties = { width: '100%', border: '1px solid var(--form-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--form-bg)', fontWeight: 500 }
const primaryBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const iconBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--text-primary)', border: '1px solid var(--form-border)', borderRadius: 999, width: 38, height: 38, display: 'grid', placeItems: 'center', fontSize: 18, lineHeight: 1, cursor: 'pointer' }
