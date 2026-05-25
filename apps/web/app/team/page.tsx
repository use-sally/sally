'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/app-shell'
import { addTeamAccountToProject, addTeamAccountToWorkspace, apiUrl, archiveTeamAccount, createTeamAccount, deleteTeamAccount, getTeamAccounts, removeTeamAccountFromProject, removeTeamAccountFromWorkspace, resetTeamAccountTwoFactor, type TeamAccountHub, updateAccountPlatformRole, uploadTeamAccountAvatar } from '../../lib/api'
import { loadSession } from '../../lib/auth'
import { platformRoleLabel } from '../../lib/roles'
import { archiveTextAction, deleteTextAction, restoreTextAction } from '../../lib/theme'

const monoFont = `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`
const panelStyle = { border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const inputStyle = { borderRadius: 10, border: '1px solid var(--form-border)', padding: '9px 10px', background: 'var(--form-bg)', color: 'var(--form-text)', fontFamily: monoFont, fontSize: 12 }
const smallButtonStyle = { borderRadius: 10, border: '1px solid var(--form-border)', padding: '8px 10px', fontWeight: 700, background: 'var(--form-bg)', color: 'var(--form-text)', cursor: 'pointer', fontFamily: monoFont, fontSize: 12 }

async function compressTeamAvatar(file: File): Promise<{ mimeType: string; base64: string; fileName: string }> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUrl
    })
    const maxLongSide = 1600
    const longSide = Math.max(image.width, image.height)
    const scale = longSide > maxLongSide ? maxLongSide / longSide : 1
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)
    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const quality = mimeType === 'image/png' ? undefined : 0.82
    const dataUrl = canvas.toDataURL(mimeType, quality)
    const base64 = dataUrl.split(',')[1] || ''
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'team-avatar'
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    return { mimeType, base64, fileName: `${baseName}.${ext}` }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

type TeamAccount = TeamAccountHub['accounts'][number]

export default function TeamPage() {
  const [hub, setHub] = useState<TeamAccountHub | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const session = typeof window !== 'undefined' ? loadSession() : null
  const platformRole = session?.account?.platformRole
  const isPlatformAdmin = platformRole === 'SUPERADMIN' || platformRole === 'ADMIN'
  const isSuperadmin = platformRole === 'SUPERADMIN'

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      setHub(await getTeamAccounts())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const accounts = useMemo(() => {
    const term = query.trim().toLowerCase()
    const items = (hub?.accounts ?? []).filter((account) => showArchived || !account.archivedAt)
    if (!term) return items
    return items.filter((account) => `${account.name || ''} ${account.email} ${account.platformRole}`.toLowerCase().includes(term))
  }, [hub, query, showArchived])

  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    setSaving(key)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(message)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setSaving(null)
    }
  }

  const handleCreate = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) {
      setError('Email is required.')
      return
    }
    await run('create', () => createTeamAccount({ email, name: newName.trim() || undefined }), 'User added.')
    setNewName('')
    setNewEmail('')
  }

  if (!isPlatformAdmin) {
    return (
      <AppShell title="Team" subtitle="platform / users">
        <div style={{ ...panelStyle, padding: 18, color: 'var(--danger-text)' }}>Only platform admins can access Team.</div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Team" subtitle="platform / users">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ ...panelStyle, padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#fcd34d', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Team section</div>
              <h1 style={{ margin: '6px 0 0', color: 'var(--text-primary)', fontSize: 22 }}>Every user in this Sally instance</h1>
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>Central hub to add, archive, permanently delete, promote or demote users, and manage their workspace and project access.</p>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading} style={smallButtonStyle}>{loading ? 'Loading…' : 'Refresh'}</button>
          </div>
          {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
          {notice ? <div style={{ color: '#6ee7b7', fontSize: 13 }}>{notice}</div> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(240px, 1fr) auto', gap: 10, alignItems: 'center' }}>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Name" style={inputStyle} />
            <input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate() }} placeholder="email@example.com" style={inputStyle} />
            <button type="button" onClick={() => void handleCreate()} disabled={saving === 'create'} style={smallButtonStyle}>{saving === 'create' ? 'Adding…' : 'Add user'}</button>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" style={{ ...inputStyle, maxWidth: 420, flex: '1 1 260px' }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              Show archived users
            </label>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          {accounts.map((account) => (
            <TeamAccountRow
              key={account.id}
              account={account}
              hub={hub}
              currentAccountId={session?.account?.id ?? null}
              isSuperadmin={isSuperadmin}
              saving={saving}
              onAction={run}
            />
          ))}
          {!loading && accounts.length === 0 ? <div style={{ ...panelStyle, padding: 18, color: 'var(--text-muted)' }}>No users found.</div> : null}
        </section>
      </div>
    </AppShell>
  )
}

function TeamAccountRow({ account, hub, currentAccountId, isSuperadmin, saving, onAction }: { account: TeamAccount; hub: TeamAccountHub | null; currentAccountId: string | null; isSuperadmin: boolean; saving: string | null; onAction: (key: string, action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceRole, setWorkspaceRole] = useState('MEMBER')
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(null)
  const [projectDrafts, setProjectDrafts] = useState<Record<string, { projectId: string; role: string }>>({})
  const archived = !!account.archivedAt
  const isCurrentAccount = account.id === currentAccountId
  const isSuperadminAccount = account.platformRole === 'SUPERADMIN'
  const visibleWorkspaceMemberships = account.memberships.filter((membership) => !membership.workspaceArchivedAt)
  const visibleProjectMemberships = account.projectMemberships.filter((membership) => !membership.projectWorkspaceArchivedAt)
  const availableWorkspaces = (hub?.workspaceMemberships ?? []).filter((workspace) => !workspace.archivedAt && !account.memberships.some((membership) => membership.workspaceId === workspace.id))
  const availableProjects = hub?.projectMemberships ?? []
  const setProjectDraft = (workspaceId: string, patch: Partial<{ projectId: string; role: string }>) => {
    setProjectDrafts((drafts) => ({ ...drafts, [workspaceId]: { projectId: drafts[workspaceId]?.projectId ?? '', role: drafts[workspaceId]?.role ?? 'MEMBER', ...patch } }))
  }
  const avatarSrc = account.avatarUrl ? (account.avatarUrl.startsWith('/') ? apiUrl(account.avatarUrl) : account.avatarUrl) : ''
  const avatarInitial = (account.name?.trim()?.[0] || account.email.trim()[0] || '?').toUpperCase()

  return (
    <article style={{ ...panelStyle, padding: 16, opacity: archived ? 0.62 : 1, display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '56px minmax(220px, 1fr) 180px 160px auto', gap: 12, alignItems: 'center' }}>
        <label
          title="Click to upload or replace team member avatar"
          aria-label={`Upload avatar for ${account.name || account.email}`}
          style={{ width: 48, height: 48, borderRadius: 999, border: '1px solid var(--form-border)', background: 'color-mix(in srgb, var(--form-border-focus) 18%, transparent)', color: 'var(--text-primary)', display: 'grid', placeItems: 'center', overflow: 'hidden', fontWeight: 800, cursor: saving === `avatar:${account.id}` ? 'progress' : 'pointer' }}
        >
          {avatarSrc ? <span aria-hidden="true" style={{ width: '100%', height: '100%', backgroundImage: `url(${avatarSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }} /> : avatarInitial}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={saving === `avatar:${account.id}`}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void onAction(`avatar:${account.id}`, async () => {
                const compressed = await compressTeamAvatar(file)
                await uploadTeamAccountAvatar(account.id, compressed)
              }, 'Team member avatar updated.')
            }}
            style={{ display: 'none' }}
          />
        </label>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name || account.email}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.email}</div>
          {archived ? <div style={{ color: 'var(--danger-text)', fontSize: 11, fontWeight: 800, marginTop: 5 }}>Archived</div> : null}
          <div style={{ color: account.twoFactorEnabled ? '#6ee7b7' : 'var(--text-muted)', fontSize: 11, fontWeight: 800, marginTop: 5 }}>
            2FA {account.twoFactorEnabled ? 'enabled' : 'not enabled'}{account.twoFactorConfirmedAt ? ` · TOTP ${new Date(account.twoFactorConfirmedAt).toLocaleDateString()}` : ''}{account.passkeyCount ? ` · ${account.passkeyCount} passkey${account.passkeyCount === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        {isSuperadminAccount ? (
          <div style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
            Platform role
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, textTransform: 'none' }}>{platformRoleLabel(account.platformRole)}</div>
          </div>
        ) : (
          <label style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
            Platform role
            <select
              value={account.platformRole}
              disabled={!isSuperadmin || isCurrentAccount || saving === `role:${account.id}`}
              onChange={(event) => void onAction(`role:${account.id}`, () => updateAccountPlatformRole(account.id, { platformRole: event.target.value as 'NONE' | 'ADMIN' | 'SUPERADMIN' }), 'Platform role updated.')}
              style={inputStyle}
            >
              <option value="NONE">User</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Superadmin</option>
            </select>
          </label>
        )}
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>{platformRoleLabel(account.platformRole)}</div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
          {isSuperadminAccount ? null : archived ? (
            <button
              type="button"
              onClick={() => void onAction(`archive:${account.id}`, () => archiveTeamAccount(account.id, false), 'User restored.')}
              disabled={saving === `archive:${account.id}`}
              style={{ ...restoreTextAction, opacity: saving === `archive:${account.id}` ? 0.5 : 1 }}
            >
              Restore user
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onAction(`archive:${account.id}`, () => archiveTeamAccount(account.id, true), 'User archived.')}
              disabled={saving === `archive:${account.id}` || isCurrentAccount}
              style={{ ...archiveTextAction, opacity: saving === `archive:${account.id}` || isCurrentAccount ? 0.5 : 1 }}
            >
              Archive user
            </button>
          )}
          {account.twoFactorEnabled ? (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Reset 2FA for ${account.name || account.email}? This removes their authenticator and passkeys; they will need to enroll again.`)) return
                void onAction(`2fa:${account.id}`, () => resetTeamAccountTwoFactor(account.id), '2FA reset. The user must enroll again.')
              }}
              disabled={saving === `2fa:${account.id}` || isCurrentAccount}
              style={{ ...archiveTextAction, opacity: saving === `2fa:${account.id}` || isCurrentAccount ? 0.5 : 1 }}
              title={isCurrentAccount ? 'Reset your own 2FA from Profile.' : 'Clear this user’s 2FA credential for account recovery.'}
            >
              Reset 2FA
            </button>
          ) : null}
          {!isSuperadminAccount && archived ? (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Delete ${account.name || account.email} permanently? This cannot be undone.`)) return
                void onAction(`delete:${account.id}`, () => deleteTeamAccount(account.id), 'User deleted.')
              }}
              disabled={saving === `delete:${account.id}` || isCurrentAccount}
              style={{ ...deleteTextAction, opacity: saving === `delete:${account.id}` || isCurrentAccount ? 0.5 : 1 }}
            >
              Delete user
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ color: '#fcd34d', fontSize: 12, fontWeight: 800 }}>Workspaces & projects</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px auto', gap: 8 }}>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} style={inputStyle}><option value="">Add workspace</option>{availableWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
          <select value={workspaceRole} onChange={(event) => setWorkspaceRole(event.target.value)} style={inputStyle}><option value="MEMBER">Member</option><option value="OWNER">Owner</option></select>
          <button type="button" disabled={!workspaceId} onClick={() => void onAction(`addw:${account.id}`, () => addTeamAccountToWorkspace(account.id, { workspaceId, role: workspaceRole }), 'Workspace access added.').then(() => { setExpandedWorkspaceId(workspaceId); setWorkspaceId('') })} style={smallButtonStyle}>Add</button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {visibleWorkspaceMemberships.map((membership) => {
            const expanded = expandedWorkspaceId === membership.workspaceId
            const projectsInWorkspace = visibleProjectMemberships.filter((project) => project.workspaceId === membership.workspaceId)
            const projectDraft = projectDrafts[membership.workspaceId] ?? { projectId: '', role: 'MEMBER' }
            const addableProjects = availableProjects.filter((project) => project.workspaceId === membership.workspaceId && !project.projectWorkspaceArchivedAt && !account.projectMemberships.some((existing) => existing.projectId === project.id))
            return (
              <div key={membership.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 14, background: 'color-mix(in srgb, var(--panel-bg) 82%, transparent)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 10, alignItems: 'center', padding: 12 }}>
                  <button type="button" onClick={() => setExpandedWorkspaceId(expanded ? null : membership.workspaceId)} style={{ border: 0, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', display: 'grid', gap: 3, justifyItems: 'start', padding: 0, textAlign: 'left' }}>
                    <span style={{ fontWeight: 850 }}>{expanded ? '▾' : '▸'} {membership.workspaceName}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{membership.role.toLowerCase()} · {projectsInWorkspace.length} active project{projectsInWorkspace.length === 1 ? '' : 's'}</span>
                  </button>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>{membership.role.toLowerCase()}</span>
                  <button type="button" onClick={() => void onAction(`rmw:${membership.id}`, () => removeTeamAccountFromWorkspace(account.id, membership.id), 'Workspace access removed.')} style={{ ...deleteTextAction, fontSize: 12 }}>Remove workspace</button>
                </div>
                {expanded ? (
                  <div style={{ borderTop: '1px solid var(--panel-border)', padding: 12, display: 'grid', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px auto', gap: 8 }}>
                      <select value={projectDraft.projectId} onChange={(event) => setProjectDraft(membership.workspaceId, { projectId: event.target.value })} style={inputStyle}>
                        <option value="">Add project in {membership.workspaceName}</option>
                        {addableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>
                      <select value={projectDraft.role} onChange={(event) => setProjectDraft(membership.workspaceId, { role: event.target.value })} style={inputStyle}><option value="MEMBER">Member</option><option value="OWNER">Owner</option></select>
                      <button type="button" disabled={!projectDraft.projectId} onClick={() => void onAction(`addp:${account.id}:${membership.workspaceId}`, () => addTeamAccountToProject(account.id, { projectId: projectDraft.projectId, role: projectDraft.role }), 'Project access added.').then(() => setProjectDraft(membership.workspaceId, { projectId: '' }))} style={smallButtonStyle}>Add</button>
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {projectsInWorkspace.map((project) => (
                        <div key={project.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center', border: '1px solid var(--panel-border)', borderRadius: 10, padding: '8px 10px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.projectName}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{project.role.toLowerCase()}</span>
                          <button type="button" onClick={() => void onAction(`rmp:${project.id}`, () => removeTeamAccountFromProject(account.id, project.id), 'Project access removed.')} style={{ ...deleteTextAction, fontSize: 12 }}>Remove</button>
                        </div>
                      ))}
                      {projectsInWorkspace.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No active projects in this workspace.</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
          {visibleWorkspaceMemberships.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No workspace access yet.</div> : null}
        </div>
      </div>
    </article>
  )
}
