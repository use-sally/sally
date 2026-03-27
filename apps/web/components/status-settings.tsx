'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createProjectStatus, deleteProjectStatus, updateProjectStatus } from '../lib/api'
import { canonicalStatusColor, resolveStatusPair, statusThemeVars, STATUS_COLOR_PAIRS } from '../lib/status-colors'
import { qk } from '../lib/query'
import { deleteTextAction, labelText, projectInputField } from '../lib/theme'

export function StatusSettings({ projectId, statuses, canManage = true }: { projectId: string; statuses: { id: string; name: string; type: string; position: number; color?: string | null; taskCount?: number }[]; canManage?: boolean }) {
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
      setError(err instanceof Error ? err.message : 'Failed to update status')
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
      <div style={cardsGrid}>
        {statuses.map((status) => (
          <div key={status.id} style={statusCardStyle(status.color)}>
            <div style={{ display: 'grid', gap: 8 }}>
              {canManage && editingStatusId === status.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => void commitRename(status.id, status.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') {
                      setEditingStatusId(null)
                      setDraftName(status.name)
                    }
                  }}
                  className="status-theme-surface"
                  style={{ ...statusNameInput, ...statusThemeVars(status.color) }}
                />
              ) : canManage ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingStatusId(status.id)
                    setDraftName(status.name)
                  }}
                  className="status-theme-surface"
                  style={{ ...statusNameButton, ...statusThemeVars(status.color) }}
                >
                  {status.name}
                </button>
              ) : (
                <div className="status-theme-surface" style={{ ...statusNameStatic, ...statusThemeVars(status.color) }}>{status.name}</div>
              )}
              <div style={statusInfoRow}>
                {canManage ? (
                  <details style={{ position: 'relative' }} open={openColorStatusId === status.id}>
                    <summary
                      onClick={(event) => {
                        event.preventDefault()
                        setOpenColorStatusId((current) => current === status.id ? null : status.id)
                      }}
                      style={{ ...colorSummaryText, color: resolveStatusPair(status.color)?.darkText ?? 'var(--text-secondary)' }}
                    >
                      {resolveStatusPair(status.color)?.id ?? 'default'}
                    </summary>
                    {openColorStatusId === status.id ? (
                      <div style={colorMenu}>
                        {presets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setOpenColorStatusId(null)
                              void rename(status.id, status.name, canonicalStatusColor(preset.darkBg) || preset.darkBg)
                            }}
                            title={`Set status color ${preset.id}`}
                            style={{ ...colorOptionButton, color: preset.darkText }}
                          >
                            {preset.id}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </details>
                ) : (
                  <div style={{ ...colorSummaryText, color: resolveStatusPair(status.color)?.darkText ?? 'var(--text-secondary)' }}>
                    {resolveStatusPair(status.color)?.id ?? 'default'}
                  </div>
                )}
                <div style={statusMetaText}>{status.taskCount ?? 0} {(status.taskCount ?? 0) === 1 ? 'task' : 'tasks'}</div>
              </div>
              {canManage && status.id !== statuses[0]?.id ? <button onClick={() => void remove(status.id)} disabled={statuses.length <= 1} style={deleteRowText}>Delete</button> : null}
            </div>
          </div>
        ))}

        {canManage ? (
          <div style={addCard}>
            <div style={{ ...labelText, fontSize: 14 }}>New status</div>
            <input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} placeholder="Add new status" style={projectInputField} />
            <div style={{ ...labelText, fontSize: 13 }}>Press Enter to create</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const cardsGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }
const statusCard: React.CSSProperties = { background: 'var(--panel-bg)', color: 'var(--text-primary)', borderRadius: 16, padding: 16, display: 'grid', gap: 10, alignContent: 'start' }
const addCard: React.CSSProperties = { border: '1px dashed var(--panel-border)', borderRadius: 16, background: 'var(--form-bg)', padding: 16, display: 'grid', gap: 10, alignContent: 'start' }
const statusNameInput: React.CSSProperties = { ...projectInputField, fontWeight: 700 }
const statusNameButton: React.CSSProperties = { ...projectInputField, textAlign: 'left', fontWeight: 700, cursor: 'text', background: 'transparent' }
const statusNameStatic: React.CSSProperties = { ...projectInputField, textAlign: 'left', fontWeight: 700, cursor: 'default', background: 'transparent' }
const statusInfoRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
const statusMetaText: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 13, fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`, textAlign: 'right' }
const colorSummaryText: React.CSSProperties = { listStyle: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 400, textTransform: 'lowercase' }
const colorMenu: React.CSSProperties = { position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 10, minWidth: 140, display: 'grid', gap: 2, padding: 8, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)' }
const colorOptionButton: React.CSSProperties = { background: 'transparent', border: 'none', padding: '6px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, textTransform: 'lowercase', fontSize: 13, fontWeight: 400 }
const deleteRowText: React.CSSProperties = { ...deleteTextAction, justifySelf: 'end' }

function statusCardStyle(color?: string | null): React.CSSProperties {
  const pair = resolveStatusPair(color)
  const accent = pair?.darkText ?? 'rgba(16, 185, 129, 0.22)'
  return {
    ...statusCard,
    border: `1px solid ${accent}`,
    boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 10px 28px color-mix(in srgb, ${accent} 18%, transparent)`,
  }
}
