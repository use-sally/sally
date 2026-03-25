'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createProjectStatus, deleteProjectStatus, updateProjectStatus } from '../lib/api'
import { canonicalStatusColor, statusThemeVars, STATUS_COLOR_PAIRS } from '../lib/status-colors'
import { qk } from '../lib/query'
import { deleteTextAction } from '../lib/theme'

export function StatusSettings({ projectId, statuses }: { projectId: string; statuses: { id: string; name: string; type: string; position: number; color?: string | null }[] }) {
  const qc = useQueryClient()
  const [newStatus, setNewStatus] = useState('')
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [openColorStatusId, setOpenColorStatusId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const presets = useMemo(() => STATUS_COLOR_PAIRS, [])

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
    ])
  }

  async function rename(statusId: string, name: string, color?: string) {
    setError(null)
    try {
      await updateProjectStatus(projectId, statusId, { name, ...(color !== undefined ? { color } : {}) })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename status')
    }
  }

  async function add() {
    const name = newStatus.trim()
    if (!name) return
    setError(null)
    try {
      await createProjectStatus(projectId, { name })
      setNewStatus('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add status')
    }
  }

  async function remove(statusId: string) {
    const alternatives = statuses.filter((s) => s.id !== statusId)
    const targetStatusId = alternatives[0]?.id
    setError(null)
    try {
      await deleteProjectStatus(projectId, statusId, targetStatusId ? { targetStatusId } : {})
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove status')
    }
  }

  async function commitRename(statusId: string, originalName: string) {
    const name = draftName.trim()
    setEditingStatusId(null)
    if (!name || name === originalName) return
    await rename(statusId, name)
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4 }}>
      {statuses.map((status) => (
        <div key={status.id} style={{ minWidth: 220, border: '1px solid var(--panel-border)', borderRadius: 14, background: 'var(--panel-bg)', padding: 12, display: 'grid', gap: 10 }}>
          {editingStatusId === status.id ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => void commitRename(status.id, status.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
                if (e.key === 'Escape') {
                  setEditingStatusId(null)
                  setDraftName(status.name)
                }
              }}
              className="status-theme-surface"
              style={{ ...inputStyle, ...statusThemeVars(status.color) }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingStatusId(status.id)
                setDraftName(status.name)
              }}
              className="status-theme-surface"
              style={{ width: '100%', textAlign: 'left', border: '1px solid transparent', borderRadius: 12, padding: '10px 12px', ...statusThemeVars(status.color), fontWeight: 600, cursor: 'text' }}
            >
              {status.name}
            </button>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setOpenColorStatusId((current) => current === status.id ? null : status.id)}
                aria-label="Choose status color"
                title="Choose status color"
                className="status-theme-surface"
                style={{ width: 22, height: 22, borderRadius: 999, border: '1px solid var(--form-border)', ...statusThemeVars(status.color), cursor: 'pointer', padding: 0 }}
              />
              {openColorStatusId === status.id ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setOpenColorStatusId(null)
                        void rename(status.id, status.name, canonicalStatusColor(preset.darkBg) || preset.darkBg)
                      }}
                      title={`Set status color ${preset.id}`}
                      className="status-theme-surface"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        border: canonicalStatusColor(status.color)?.toLowerCase() === preset.darkBg.toLowerCase() ? '2px solid var(--form-border-focus)' : '1px solid var(--form-border)',
                        ...statusThemeVars(preset.darkBg),
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            {status.id === statuses[0]?.id ? null : <button onClick={() => void remove(status.id)} disabled={statuses.length <= 1} aria-label="Delete status" title="Delete status" style={deleteTextAction}>Delete</button>}
          </div>
        </div>
      ))}
      <div style={{ minWidth: 220, border: '1px dashed var(--panel-border)', borderRadius: 14, background: 'var(--form-bg)', padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Add status</div>
        <input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} placeholder="New status" style={inputStyle} />
      </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid var(--form-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--form-bg)', color: 'var(--form-text)' }
