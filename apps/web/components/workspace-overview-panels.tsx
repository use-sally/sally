'use client'

import type React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WorkspaceMember } from '@sally/types/src'
import { AssigneeAvatar } from './assignee-avatar'
import { cancelWorkspaceInvite, createProject, getWorkspaceMembers } from '../lib/api'
import { inviteWorkspaceMember, removeWorkspaceMember, resendWorkspaceInvite, updateWorkspaceMember } from '../lib/api'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { canEditProject } from '../lib/permissions'
import { qk, useClientsQuery, useProjectsQuery } from '../lib/query'
import { canChangeWorkspaceMemberRole, canInviteWorkspaceMembers, canManageWorkspaceInvite, canRemoveWorkspaceMember } from '../lib/workspace-permissions'
import { platformRoleLabel, workspaceRoleHelp, workspaceRoleLabel, workspaceRoleOptions } from '../lib/roles'
import { panel, pill } from './app-shell'
import { labelText, projectInputField, sectionLabelText, taskTitleText } from '../lib/theme'
import { SectionHeaderWithInfo } from './info-flag'

function WorkspaceMemberAvatar({
  member,
  roleUpdating,
  inviteActionBusy,
  removeBusy,
  canEditRole,
  canRemove,
  canManageInvite,
  onChangeRole,
  onRemove,
  onResendInvite,
  onCancelInvite,
}: {
  member: WorkspaceMember
  roleUpdating: boolean
  inviteActionBusy: boolean
  removeBusy: boolean
  canEditRole: boolean
  canRemove: boolean
  canManageInvite: boolean
  onChangeRole: (memberId: string, role: string) => void
  onRemove: (memberId: string, memberName?: string | null) => void
  onResendInvite: (inviteId: string) => void
  onCancelInvite: (inviteId: string, email: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setRoleMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={memberAvatarButton}>
        <div style={{ position: 'relative' }}>
          <AssigneeAvatar name={member.name || member.email} avatarUrl={member.avatarUrl} size={34} />
          <span style={{ ...memberStatusDot, background: member.invited ? '#fcd34d' : '#34d399' }} />
        </div>
      </button>
      {open ? (
        <div style={memberPopover}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AssigneeAvatar name={member.name || member.email} size={36} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{member.name || (member.invited ? 'Invited user' : '—')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{member.email}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: member.invited ? '#fcd34d' : 'var(--text-muted)' }}>
            {member.invited ? 'Pending invite' : `Joined ${new Date(member.createdAt).toLocaleDateString()}`}
          </div>
          {member.invited && member.inviteExpiresAt ? <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>Expires {new Date(member.inviteExpiresAt).toLocaleDateString()}</div> : null}
          <div style={{ marginTop: 8, position: 'relative' }}>
            {canEditRole && !member.invited ? (
              <>
                <button type="button" onClick={() => setRoleMenuOpen((value) => !value)} style={memberRoleTrigger}>
                  {workspaceRoleLabel(member.role)}
                </button>
                {roleMenuOpen ? (
                  <div style={memberRoleMenu}>
                    {workspaceRoleOptions.map((role) => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => {
                          setRoleMenuOpen(false)
                          onChangeRole(member.id, role.value)
                        }}
                        disabled={roleUpdating}
                        style={{ ...memberRoleOption, fontWeight: member.role === role.value ? 700 : 400 }}
                      >
                        {role.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={memberRoleStatic}>{workspaceRoleLabel(member.role)}</div>
            )}
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{workspaceRoleHelp(member.role)}</div>
            {member.invited && member.inviteId && canManageInvite ? (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => onResendInvite(member.inviteId!)} disabled={inviteActionBusy} style={memberActionButton}>{inviteActionBusy ? 'Working…' : 'Resend'}</button>
                <button type="button" onClick={() => onCancelInvite(member.inviteId!, member.email)} disabled={inviteActionBusy} style={memberActionButton}>Cancel</button>
              </div>
            ) : null}
            {canRemove && !member.invited ? (
              <button type="button" onClick={() => onRemove(member.id, member.name)} disabled={removeBusy} style={memberRemoveText}>
                {removeBusy ? 'Removing…' : 'Remove'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceOverviewPanels() {
  const router = useRouter()
  const qc = useQueryClient()
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)

  const session = useMemo(() => loadSession(), [])
  const activeWorkspace = useMemo(() => {
    if (!session?.memberships?.length) return null
    const currentId = getWorkspaceId()
    return session.memberships.find((m) => m.workspaceId === currentId) ?? session.memberships[0]
  }, [session])

  const { data: projects = [], error: projectsError } = useProjectsQuery()
  const { data: clients = [] } = useClientsQuery()

  const workspaceViewer = {
    accountId: session?.account?.id ?? null,
    platformRole: session?.account?.platformRole ?? null,
    workspaceRole: activeWorkspace?.role ?? null,
  }
  const projectEditDecision = canEditProject({ ...workspaceViewer, projectRole: null }, { archived: false })

  useEffect(() => {
    const currentId = getWorkspaceId()
    if (currentId) setWorkspaceId(currentId)
  }, [])

  async function handleCreateProject() {
    const name = newProjectName.trim()
    if (!name || creatingProject || !projectEditDecision.allowed) return
    setCreatingProject(true)
    try {
      const created = await createProject({ name })
      setNewProjectName('')
      await qc.invalidateQueries({ queryKey: ['projects'] })
      await qc.invalidateQueries({ queryKey: qk.projectsSummary })
      router.push(`/projects/${created.projectId}`)
    } finally {
      setCreatingProject(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--panel-border)' }}>
          <div style={{ ...sectionLabelText, margin: 0 }}>Projects</div>
          <span style={labelText}>{projects.length} loaded</span>
        </div>

        {projectEditDecision.visible ? (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--panel-border)' }}>
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleCreateProject()
                }
              }}
              placeholder={creatingProject ? 'Creating project…' : 'Add project title and press Enter'}
              disabled={creatingProject || !projectEditDecision.allowed}
              style={{ ...projectInputField, width: '100%', padding: '14px 16px', borderRadius: 16 }}
            />
          </div>
        ) : null}

        <div style={{ display: 'grid' }}>
          {projects.map((project, index) => {
            const clientName = clients.find((client) => client.id === project.client?.id)?.name ?? project.client?.name ?? '—'
            return (
              <div
                key={project.id}
                style={{
                  padding: '16px 18px',
                  borderTop: index === 0 ? '1px solid transparent' : '1px solid rgba(16, 185, 129, 0.10)',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <Link href={`/projects/${project.id}`} style={{ ...taskTitleText, fontWeight: 700, textDecoration: 'none' }}>{project.name}</Link>
                  <span style={pill(
                    project.status === 'Active'
                      ? 'rgba(16, 185, 129, 0.14)'
                      : project.status === 'Review'
                        ? 'rgba(250, 204, 21, 0.14)'
                        : 'rgba(148, 163, 184, 0.14)',
                    project.status === 'Active'
                      ? '#a7f3d0'
                      : project.status === 'Review'
                        ? '#fde68a'
                        : '#cbd5e1'
                  )}>{project.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ ...labelText, fontSize: 13 }}>{clientName} · {project.tasks} open items</div>
                  <Link href={`/projects/${project.id}`} style={{ textDecoration: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>Open →</Link>
                </div>
              </div>
            )
          })}
          {!projects.length ? <div style={{ padding: '18px', ...labelText, fontSize: 13 }}>No projects yet.</div> : null}
          {projectsError ? <div style={{ padding: '18px', color: 'var(--danger-text)', fontSize: 13 }}>{projectsError instanceof Error ? projectsError.message : 'Failed to load projects'}</div> : null}
        </div>
      </div>
    </div>
  )
}

export function WorkspaceMembersCard() {
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [memberInviteMode, setMemberInviteMode] = useState(false)
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [inviteActionId, setInviteActionId] = useState<string | null>(null)

  const session = useMemo(() => loadSession(), [])
  const activeWorkspace = useMemo(() => {
    if (!session?.memberships?.length) return null
    const currentId = getWorkspaceId()
    return session.memberships.find((m) => m.workspaceId === currentId) ?? session.memberships[0]
  }, [session])

  const workspaceViewer = {
    accountId: session?.account?.id ?? null,
    platformRole: session?.account?.platformRole ?? null,
    workspaceRole: activeWorkspace?.role ?? null,
  }
  const inviteDecision = canInviteWorkspaceMembers(workspaceViewer)
  const inviteRoleOptions = useMemo(() => {
    if (session?.account?.platformRole === 'SUPERADMIN') return workspaceRoleOptions
    return workspaceRoleOptions.filter((role) => role.value !== 'OWNER')
  }, [session?.account?.platformRole])

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
      const response = await inviteWorkspaceMember({ email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail('')
      setInviteName('')
      setInviteRole('MEMBER')
      setMemberInviteMode(false)
      setMemberPickerOpen(false)
      setInfo(response.emailed ? 'Invite email sent.' : 'Invite created, but the email could not be sent. Check SMTP configuration and resend the invite.')
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

  const handleResendInvite = async (inviteId: string) => {
    if (!workspaceId) return
    setInviteActionId(inviteId)
    setError(null)
    try {
      await resendWorkspaceInvite(workspaceId, inviteId)
      await loadMembers(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invite')
    } finally {
      setInviteActionId(null)
    }
  }

  const handleCancelInvite = async (inviteId: string, email: string) => {
    if (!workspaceId) return
    if (!window.confirm(`Cancel the pending invite for ${email}?`)) return
    setInviteActionId(inviteId)
    setError(null)
    try {
      await cancelWorkspaceInvite(workspaceId, inviteId)
      await loadMembers(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invite')
    } finally {
      setInviteActionId(null)
    }
  }

  return (
    <div style={{ ...panel, minHeight: 0 }}>
      <div style={sectionLabelText}>Members</div>
      {loading ? <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div> : null}
      {error ? <div style={{ marginTop: 12, color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {info ? <div style={{ marginTop: 12, color: '#34d399', fontSize: 12 }}>{info}</div> : null}
      {!!members.length || inviteDecision.visible ? (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {members.map((member) => {
            const roleDecision = canChangeWorkspaceMemberRole(workspaceViewer, member)
            const removeDecision = canRemoveWorkspaceMember(workspaceViewer, member)
            const inviteManageTargetDecision = canManageWorkspaceInvite(workspaceViewer)
            return (
              <WorkspaceMemberAvatar
                key={member.id}
                member={member}
                roleUpdating={roleUpdatingId === member.id}
                inviteActionBusy={inviteActionId === member.inviteId}
                removeBusy={removingId === member.id}
                canEditRole={roleDecision.visible && roleDecision.allowed}
                canRemove={removeDecision.visible && removeDecision.allowed}
                canManageInvite={inviteManageTargetDecision.visible && inviteManageTargetDecision.allowed}
                onChangeRole={handleRoleChange}
                onRemove={handleRemove}
                onResendInvite={handleResendInvite}
                onCancelInvite={handleCancelInvite}
              />
            )
          })}
          {inviteDecision.visible ? (
            <div style={{ position: 'relative' }}>
              {memberInviteMode ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    autoFocus
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    onBlur={() => { if (!inviting && !inviteEmail.trim()) setMemberInviteMode(false) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleInvite({ preventDefault() {} } as React.FormEvent)
                      }
                      if (event.key === 'Escape') {
                        setInviteEmail('')
                        setInviteName('')
                        setMemberInviteMode(false)
                        setMemberPickerOpen(false)
                      }
                    }}
                    placeholder="Invite by email"
                    style={memberAddInput}
                  />
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={inviting} style={memberRoleInlineSelect}>
                    {inviteRoleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                </div>
              ) : (
                <button type="button" onClick={() => setMemberPickerOpen((value) => !value)} style={memberAddButton}>Add member</button>
              )}
              {memberPickerOpen && !memberInviteMode ? (
                <div style={memberAddMenu}>
                  <button
                    type="button"
                    onClick={() => {
                      setMemberInviteMode(true)
                      setMemberPickerOpen(false)
                    }}
                    style={memberAddOption}
                  >
                    Invite by email
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : !loading ? <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 14 }}>No members yet.</div> : null}
    </div>
  )
}

const inputStyle: React.CSSProperties = { ...projectInputField }
const primaryButton: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const memberAvatarButton: React.CSSProperties = { padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 999 }
const memberAddButton: React.CSSProperties = { ...projectInputField, width: 'auto', padding: '6px 10px', fontSize: 12, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`, background: 'var(--form-bg)', cursor: 'pointer' }
const memberAddInput: React.CSSProperties = { ...projectInputField, width: 180, padding: '6px 10px', fontSize: 12, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace` }
const memberAddMenu: React.CSSProperties = { position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 21, minWidth: 200, display: 'grid', gap: 2, padding: 8, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const memberAddOption: React.CSSProperties = { background: 'transparent', border: 'none', padding: '7px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace` }
const memberRoleInlineSelect: React.CSSProperties = { ...projectInputField, width: 'auto', padding: '6px 10px', fontSize: 12, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace` }
const memberPopover: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 20, minWidth: 240, maxWidth: 280, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--form-bg)', boxShadow: 'var(--panel-shadow)' }
const memberRoleTrigger: React.CSSProperties = { marginTop: 0, padding: 0, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', lineHeight: 1.2 }
const memberRoleStatic: React.CSSProperties = { marginTop: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.2 }
const memberRoleMenu: React.CSSProperties = { position: 'absolute', left: 0, top: 'calc(100% + 6px)', zIndex: 21, minWidth: 140, display: 'grid', gap: 2, padding: 8, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const memberRoleOption: React.CSSProperties = { background: 'transparent', border: 'none', padding: '6px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }
const memberRemoveText: React.CSSProperties = { marginTop: 8, padding: 0, border: 'none', background: 'transparent', color: 'var(--danger-text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', lineHeight: 1.2 }
const memberActionButton: React.CSSProperties = { borderRadius: 10, border: '1px solid var(--form-border)', padding: '6px 10px', fontWeight: 700, background: 'rgba(3, 7, 18, 0.96)', color: 'var(--text-primary)', fontSize: 12 }
const memberStatusDot: React.CSSProperties = { position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 999, border: '2px solid var(--panel-bg)' }
