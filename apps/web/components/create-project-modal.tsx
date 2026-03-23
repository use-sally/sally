'use client'

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createProject } from '../lib/api'
import { qk } from '../lib/query'
import { ClientPicker } from './client-picker'

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    try {
      setSaving(true)
      setError(null)
      const result = await createProject({ name, description, clientId: clientId || null })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.projects }),
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
        </div>
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
