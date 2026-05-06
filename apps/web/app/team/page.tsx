'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../components/app-shell'
import { addTeamAccountToProject, addTeamAccountToWorkspace, archiveTeamAccount, createTeamAccount, getTeamAccounts, removeTeamAccountFromProject, removeTeamAccountFromWorkspace, type TeamAccountHub, updateAccountPlatformRole } from '../../lib/api'
import { loadSession } from '../../lib/auth'
import { platformRoleLabel } from '../../lib/roles'

const monoFont = `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`
const panelStyle = { border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const inputStyle = { borderRadius: 10, border: '1px solid var(--form-border)', padding: '9px 10px', background: 'var(--form-bg)', color: 'var(--form-text)', fontFamily: monoFont, fontSize: 12 }
const smallButtonStyle = { borderRadius: 10, border: '1px solid var(--form-border)', padding: '8px 10px', fontWeight: 700, background: 'var(--form-bg)', color: 'var(--form-text)', cursor: 'pointer', fontFamily: monoFont, fontSize: 12 }

type TeamAccount = TeamAccountHub['accounts'][number]

export default function TeamPage() {
  const [hub, setHub] = useState<TeamAccountHub | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
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
    const items = hub?.accounts ?? []
    if (!term) return items
    return items.filter((account) => `${account.name || ''} ${account.email} ${account.platformRole}`.toLowerCase().includes(term))
  }, [hub, query])

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
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>Central hub to add, archive, promote or demote users, and manage their workspace and project access.</p>
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" style={{ ...inputStyle, maxWidth: 420 }} />
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          {accounts.map((account) => (
            <TeamAccountRow
              key={account.id}
              account={account}
              hub={hub}
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

function TeamAccountRow({ account, hub, isSuperadmin, saving, onAction }: { account: TeamAccount; hub: TeamAccountHub | null; isSuperadmin: boolean; saving: string | null; onAction: (key: string, action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceRole, setWorkspaceRole] = useState('MEMBER')
  const [projectId, setProjectId] = useState('')
  const [projectRole, setProjectRole] = useState('MEMBER')
  const archived = !!account.archivedAt
  const availableWorkspaces = (hub?.workspaceMemberships ?? []).filter((workspace) => !account.memberships.some((membership) => membership.workspaceId === workspace.id))
  const availableProjects = (hub?.projectMemberships ?? []).filter((project) => !account.projectMemberships.some((membership) => membership.projectId === project.id))

  return (
    <article style={{ ...panelStyle, padding: 16, opacity: archived ? 0.62 : 1, display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 180px 160px auto', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name || account.email}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.email}</div>
          {archived ? <div style={{ color: 'var(--danger-text)', fontSize: 11, fontWeight: 800, marginTop: 5 }}>Archived</div> : null}
        </div>
        <label style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
          Platform role
          <select
            value={account.platformRole}
            disabled={!isSuperadmin || saving === `role:${account.id}`}
            onChange={(event) => void onAction(`role:${account.id}`, () => updateAccountPlatformRole(account.id, { platformRole: event.target.value as 'NONE' | 'ADMIN' | 'SUPERADMIN' }), 'Platform role updated.')}
            style={inputStyle}
          >
            <option value="NONE">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPERADMIN">Superadmin</option>
          </select>
        </label>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>{platformRoleLabel(account.platformRole)}</div>
        <button
          type="button"
          onClick={() => void onAction(`archive:${account.id}`, () => archiveTeamAccount(account.id, !archived), archived ? 'User restored.' : 'User archived.')}
          disabled={saving === `archive:${account.id}`}
          style={{ ...smallButtonStyle, color: archived ? '#6ee7b7' : 'var(--danger-text)' }}
        >
          {archived ? 'Restore user' : 'Archive user'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: '#fcd34d', fontSize: 12, fontWeight: 800 }}>Workspaces</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {account.memberships.map((membership) => (
              <span key={membership.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--panel-border)', borderRadius: 999, padding: '6px 9px', color: 'var(--text-secondary)', fontSize: 12 }}>
                {membership.workspaceName} · {membership.role.toLowerCase()}
                <button type="button" onClick={() => void onAction(`rmw:${membership.id}`, () => removeTeamAccountFromWorkspace(account.id, membership.id), 'Workspace access removed.')} style={{ background: 'transparent', border: 0, color: 'var(--danger-text)', cursor: 'pointer', fontWeight: 900 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px auto', gap: 8 }}>
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} style={inputStyle}><option value="">Add workspace</option>{availableWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
            <select value={workspaceRole} onChange={(event) => setWorkspaceRole(event.target.value)} style={inputStyle}><option value="MEMBER">Member</option><option value="OWNER">Owner</option></select>
            <button type="button" disabled={!workspaceId} onClick={() => void onAction(`addw:${account.id}`, () => addTeamAccountToWorkspace(account.id, { workspaceId, role: workspaceRole }), 'Workspace access added.').then(() => setWorkspaceId(''))} style={smallButtonStyle}>Add</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: '#fcd34d', fontSize: 12, fontWeight: 800 }}>Projects</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {account.projectMemberships.map((membership) => (
              <span key={membership.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--panel-border)', borderRadius: 999, padding: '6px 9px', color: 'var(--text-secondary)', fontSize: 12 }}>
                {membership.projectName} · {membership.role.toLowerCase()}
                <button type="button" onClick={() => void onAction(`rmp:${membership.id}`, () => removeTeamAccountFromProject(account.id, membership.id), 'Project access removed.')} style={{ background: 'transparent', border: 0, color: 'var(--danger-text)', cursor: 'pointer', fontWeight: 900 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px auto', gap: 8 }}>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={inputStyle}><option value="">Add project</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.workspaceName} / {project.name}</option>)}</select>
            <select value={projectRole} onChange={(event) => setProjectRole(event.target.value)} style={inputStyle}><option value="MEMBER">Member</option><option value="OWNER">Owner</option></select>
            <button type="button" disabled={!projectId} onClick={() => void onAction(`addp:${account.id}`, () => addTeamAccountToProject(account.id, { projectId, role: projectRole }), 'Project access added.').then(() => setProjectId(''))} style={smallButtonStyle}>Add</button>
          </div>
        </div>
      </div>
    </article>
  )
}
