'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell, panel, pill } from '../../components/app-shell'
import { createWorkspace, getMe, getWorkspaceMembers, inviteWorkspaceMember, removeWorkspaceMember, updateWorkspaceMember } from '../../lib/api'
import { getWorkspaceId, loadSession, saveSession, setWorkspaceId as persistWorkspaceId } from '../../lib/auth'
import { platformRoleLabel, workspaceRoleHelp, workspaceRoleLabel, workspaceRoleOptions } from '../../lib/roles'
import type { WorkspaceMember } from '@sally/types/src'

function workspaceRoleRank(role?: string | null) {
  if (role === 'OWNER') return 3
  if (role === 'MEMBER') return 2
  if (role === 'VIEWER') return 1
  return 0
}

export default function WorkspacePage() {
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const session = useMemo(() => loadSession(), [])
  const activeWorkspace = useMemo(() => {
    if (!session?.memberships?.length) return null
    const currentId = getWorkspaceId()
    return session.memberships.find((m) => m.workspaceId === currentId) ?? session.memberships[0]
  }, [session])

  const isSuperadmin = session?.account?.platformRole === 'SUPERADMIN'
  const canManageMembers = activeWorkspace?.role === 'OWNER' || isSuperadmin
  const showActions = canManageMembers
  const memberGrid = showActions
    ? 'minmax(180px, 1.2fr) minmax(220px, 1.5fr) minmax(260px, 1.3fr) minmax(120px, 140px) 120px'
    : 'minmax(180px, 1.2fr) minmax(220px, 1.5fr) minmax(260px, 1.3fr) minmax(120px, 140px)'
  const inviteRoleOptions = useMemo(() => {
    if (isSuperadmin) return workspaceRoleOptions
    return workspaceRoleOptions.filter((role) => role.value !== 'OWNER')
  }, [isSuperadmin])

  useEffect(() => {
    const currentId = getWorkspaceId()
    if (currentId) setWorkspaceId(currentId)
  }, [])

  const loadMembers = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getWorkspaceMembers(id)
      setMembers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!workspaceId) return
    void loadMembers(workspaceId)
  }, [workspaceId])

  useEffect(() => {
    if (!inviteRoleOptions.some((role) => role.value === inviteRole)) setInviteRole(inviteRoleOptions[0]?.value ?? 'MEMBER')
  }, [inviteRole, inviteRoleOptions])

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!inviteEmail.trim()) {
      setError('Email is required to invite.')
      return
    }
    if (!workspaceId) return
    setInviting(true)
    setError(null)
    setInfo(null)
    try {
      const response = await inviteWorkspaceMember({
        email: inviteEmail.trim(),
        role: inviteRole,
      })
      setInviteEmail('')
      setInviteName('')
      setInviteRole('MEMBER')
      if (response.emailed) {
        setInfo('Invite email sent.')
      } else {
        setInfo('Invite created, but the email could not be sent. Check SMTP configuration and resend the invite.')
      }
      await loadMembers(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member')
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (memberId: string, role: string) => {
    if (!workspaceId) return
    setRoleUpdatingId(memberId)
    setError(null)
    try {
      await updateWorkspaceMember(workspaceId, memberId, { role })
      await loadMembers(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setRoleUpdatingId(null)
    }
  }

  const handleCreateWorkspace = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isSuperadmin) return
    const name = newWorkspaceName.trim()
    if (!name) {
      setError('Workspace name is required.')
      return
    }
    setCreatingWorkspace(true)
    setError(null)
    setInfo(null)
    try {
      const created = await createWorkspace({ name })
      const current = loadSession()
      const me = await getMe()
      if (current?.token) saveSession({ token: current.token, expiresAt: current.expiresAt, account: me.account, memberships: me.memberships })
      persistWorkspaceId(created.workspaceId)
      setInfo('Workspace created.')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
    } finally {
      setCreatingWorkspace(false)
    }
  }

  const canManageWorkspaceMember = (member: WorkspaceMember, nextRole?: string) => {
    if (!canManageMembers) return false
    const isSelf = session?.account?.id && member.accountId === session.account.id
    if (isSelf) return false
    if (isSuperadmin) return true
    const requesterRank = workspaceRoleRank(activeWorkspace?.role)
    const targetRank = workspaceRoleRank(member.role)
    const nextRank = nextRole ? workspaceRoleRank(nextRole) : 0
    return requesterRank > targetRank && requesterRank > nextRank
  }

  const handleRemove = async (memberId: string, memberName?: string | null) => {
    if (!workspaceId) return
    if (!window.confirm(`Remove ${memberName || 'this member'} from the workspace?`)) return
    setRemovingId(memberId)
    setError(null)
    try {
      await removeWorkspaceMember(workspaceId, memberId)
      await loadMembers(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setRemovingId(null)
    }
  }


  return (
    <AppShell title="Workspace" subtitle="Team access, roles, and workspace health.">
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 750 }}>Current workspace</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{activeWorkspace?.workspaceName ?? 'Workspace'}</div>
            {activeWorkspace ? <span style={pill('#eef2ff', '#3730a3')}>{workspaceRoleLabel(activeWorkspace.role)}</span> : null}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Workspace ID: {workspaceId || '—'}</div>
          {session?.account?.platformRole === 'SUPERADMIN' ? <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 700 }}>{platformRoleLabel(session.account.platformRole)} · full access across all workspaces</div> : null}
          {activeWorkspace ? <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{workspaceRoleHelp(activeWorkspace.role)}</div> : null}
        </div>

        {isSuperadmin ? (
          <div style={{ ...panel, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 750 }}>Create workspace</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Only superadmins can create workspaces.</div>
            <form onSubmit={handleCreateWorkspace} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Workspace name</span>
                <input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} placeholder="New workspace" style={inputStyle} />
              </label>
              <div>
                <button type="submit" disabled={creatingWorkspace} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>
                  {creatingWorkspace ? 'Creating…' : 'Create workspace'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 750 }}>Members</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Workspace role = workspace-wide access. Project access is still controlled per project.</div>
            </div>
            {loading ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</span> : null}
          </div>
          {error ? <div style={{ marginBottom: 12, color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: memberGrid, columnGap: 16, padding: '10px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--panel-border)' }}>
              <div>Name</div><div>Email</div><div>Role</div><div>Joined</div>{showActions ? <div>Actions</div> : null}
            </div>
            {members.map((member) => {
              const isSelf = session?.account?.id && member.accountId === session.account.id
              const editableRoleOptions = isSuperadmin
                ? workspaceRoleOptions
                : workspaceRoleOptions.filter((role) => canManageWorkspaceMember(member, role.value))
              return (
                <div key={member.id} style={{ display: 'grid', gridTemplateColumns: memberGrid, columnGap: 16, padding: '12px', borderBottom: '1px solid var(--panel-border)', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>{member.name ?? '—'}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>{member.email}</div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {canManageMembers ? (
                      <select
                        value={member.role}
                        onChange={(event) => void handleRoleChange(member.id, event.target.value)}
                        disabled={roleUpdatingId === member.id || !canManageWorkspaceMember(member, member.role)}
                        style={{ borderRadius: 10, border: '1px solid var(--form-border)', padding: '6px 8px', fontWeight: 600, background: 'var(--form-bg)', color: 'var(--form-text)' }}
                      >
                        {(editableRoleOptions.length ? editableRoleOptions : workspaceRoleOptions.filter((role) => role.value === member.role)).map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                      </select>
                    ) : (
                      <span style={pill('#f8fafc', '#475569')}>{workspaceRoleLabel(member.role)}</span>
                    )}
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{workspaceRoleHelp(member.role)}</div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{new Date(member.createdAt).toLocaleDateString()}</div>
                  {showActions ? (
                    <div>
                      {isSelf ? (
                        <span style={pill('#f8fafc', '#475569')}>You</span>
                      ) : (
                        <button
                          onClick={() => void handleRemove(member.id, member.name)}
                          disabled={removingId === member.id || !canManageWorkspaceMember(member)}
                          style={{ borderRadius: 10, border: '1px solid var(--form-border)', padding: '6px 10px', fontWeight: 700, background: 'rgba(3, 7, 18, 0.96)', color: 'var(--text-primary)' }}
                        >
                          {removingId === member.id ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {!members.length && !loading ? <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 12 }}>No members yet.</div> : null}
          </div>
        </div>

        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 750 }}>Invite member</div>
          {!canManageMembers ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>Only workspace owners or superadmins can invite members.</div> : null}
          {info ? <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{info}</div> : null}
          <form onSubmit={handleInvite} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Email</span>
              <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={!canManageMembers} placeholder="teammate@company.com" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Name</span>
              <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} disabled={!canManageMembers} placeholder="Optional" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Role</span>
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={!canManageMembers} style={inputStyle}>
                {inviteRoleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Workspace owners see every project in this workspace. Superadmins see every workspace. Other workspace roles only see projects they are added to.</div>
            <div>
              <button type="submit" disabled={!canManageMembers || inviting} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>
                {inviting ? 'Inviting…' : 'Send invite'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </AppShell>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--form-border)',
  fontSize: 14,
}
