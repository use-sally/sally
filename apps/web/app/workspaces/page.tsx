'use client'

import { useEffect, useState } from 'react'
import type { WorkspaceInfo } from '@sally/types/src'
import { AppShell } from '../../components/app-shell'
import { archiveWorkspace, createWorkspace, deleteWorkspace, getWorkspaces } from '../../lib/api'

export default function WorkspacesAdminPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const loadWorkspaces = async () => {
    setLoading(true)
    try {
      setWorkspaces(await getWorkspaces({ archived: true }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadWorkspaces() }, [])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setMessage('Workspace name is required.')
      return
    }
    setSaving('create')
    setMessage(null)
    try {
      await createWorkspace({ name: trimmed, ...(slug.trim() ? { slug: slug.trim() } : {}) })
      setName('')
      setSlug('')
      await loadWorkspaces()
      setMessage('Workspace created.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create workspace.')
    } finally {
      setSaving(null)
    }
  }

  const handleArchive = async (workspace: WorkspaceInfo, archived: boolean) => {
    setSaving(`archive:${workspace.id}`)
    setMessage(null)
    try {
      await archiveWorkspace(workspace.id, archived)
      await loadWorkspaces()
      setMessage(archived ? 'Workspace archived.' : 'Workspace restored.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update workspace.')
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (workspace: WorkspaceInfo) => {
    const confirmed = window.confirm(`Delete workspace "${workspace.name}" permanently? This removes its projects, tasks, clients, timesheets, and agent history.`)
    if (!confirmed) return
    setSaving(`delete:${workspace.id}`)
    setMessage(null)
    try {
      await deleteWorkspace(workspace.id)
      await loadWorkspaces()
      setMessage('Workspace deleted.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete workspace.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <AppShell title="Workspaces" subtitle="Create, archive, restore, and permanently delete Sally workspaces.">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Add workspace</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Workspace name" style={{ borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--form-text)', padding: '10px 12px', fontFamily: 'inherit' }} />
            </label>
            <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700 }}>
              Slug optional
              <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="workspace-slug" style={{ borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--form-text)', padding: '10px 12px', fontFamily: 'inherit' }} />
            </label>
            <button type="button" onClick={handleCreate} disabled={saving === 'create'} style={{ borderRadius: 12, border: '1px solid rgba(250, 204, 21, 0.45)', background: '#fcd34d', color: '#052e16', padding: '10px 14px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
              {saving === 'create' ? 'Adding…' : 'Add workspace'}
            </button>
          </div>
          {message ? <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{message}</div> : null}
        </section>

        <section style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Workspace admin</div>
              <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>Archived workspaces stay recoverable. Delete is permanent.</div>
            </div>
            <button type="button" onClick={loadWorkspaces} style={{ borderRadius: 12, border: '1px solid var(--panel-border)', background: 'transparent', color: 'var(--text-secondary)', padding: '9px 12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Refresh</button>
          </div>
          {loading ? (
            <div style={{ padding: 18, color: 'var(--text-muted)' }}>Loading workspaces…</div>
          ) : (
            <div style={{ display: 'grid' }}>
              {workspaces.map((workspace) => {
                const archived = Boolean(workspace.archivedAt)
                return (
                  <div key={workspace.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: 16, borderTop: '1px solid var(--panel-border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{workspace.name}</span>
                        {archived ? <span style={{ color: '#fcd34d', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Archived</span> : <span style={{ color: '#34d399', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Active</span>}
                      </div>
                      <div style={{ marginTop: 5, color: 'var(--text-muted)', fontSize: 12 }}>/{workspace.slug} · {workspace.id}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {archived ? (
                        <button type="button" onClick={() => handleArchive(workspace, false)} disabled={saving === `archive:${workspace.id}`} style={{ borderRadius: 10, border: '1px solid rgba(52, 211, 153, 0.35)', background: 'transparent', color: '#34d399', padding: '8px 10px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>Restore</button>
                      ) : (
                        <button type="button" onClick={() => handleArchive(workspace, true)} disabled={saving === `archive:${workspace.id}`} style={{ borderRadius: 10, border: '1px solid rgba(250, 204, 21, 0.35)', background: 'transparent', color: '#fcd34d', padding: '8px 10px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>Archive</button>
                      )}
                      <button type="button" onClick={() => handleDelete(workspace)} disabled={saving === `delete:${workspace.id}`} style={{ borderRadius: 10, border: '1px solid rgba(248, 113, 113, 0.35)', background: 'transparent', color: '#f87171', padding: '8px 10px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>Delete</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
