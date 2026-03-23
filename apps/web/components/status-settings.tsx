'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createProjectStatus, deleteProjectStatus, updateProjectStatus } from '../lib/api'
import { qk } from '../lib/query'

export function StatusSettings({ projectId, statuses }: { projectId: string; statuses: { id: string; name: string; type: string; position: number }[] }) {
  const qc = useQueryClient()
  const [newStatus, setNewStatus] = useState('')

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
    ])
  }

  async function rename(statusId: string, name: string) {
    await updateProjectStatus(projectId, statusId, { name })
    await refresh()
  }

  async function add() {
    const name = newStatus.trim()
    if (!name) return
    await createProjectStatus(projectId, { name })
    setNewStatus('')
    await refresh()
  }

  async function remove(statusId: string) {
    const alternatives = statuses.filter((s) => s.id !== statusId)
    const targetStatusId = alternatives[0]?.id
    await deleteProjectStatus(projectId, statusId, targetStatusId ? { targetStatusId } : {})
    await refresh()
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4 }}>
      {statuses.map((status) => (
        <div key={status.id} style={{ minWidth: 220, border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc', padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{status.type.replace(/_/g, ' ')}</span>
            <button onClick={() => void remove(status.id)} disabled={statuses.length <= 1} style={btnStyle}>Remove</button>
          </div>
          <input defaultValue={status.name} onBlur={(e) => { if (e.target.value !== status.name) void rename(status.id, e.target.value) }} style={inputStyle} />
        </div>
      ))}
      <div style={{ minWidth: 220, border: '1px dashed #cbd5e1', borderRadius: 14, background: '#fff', padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Add status</div>
        <input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add() }} placeholder="New status" style={inputStyle} />
        <button onClick={() => void add()} style={primaryBtnStyle}>Add status</button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 12px', background: '#fff' }
const btnStyle: React.CSSProperties = { background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 10, padding: '8px 10px', fontWeight: 700 }
const primaryBtnStyle: React.CSSProperties = { background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }
