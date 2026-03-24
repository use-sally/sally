'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell, panel, pill } from '../../../components/app-shell'
import { deleteClient, updateClient } from '../../../lib/api'
import { qk, useClientQuery } from '../../../lib/query'

export default function ClientDetailPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const params = useParams()
  const clientId = useMemo(() => (params?.clientId ? String(params.clientId) : ''), [params])
  const { data: client, error, isLoading } = useClientQuery(clientId)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return
    setName(client.name)
    setNotes(client.notes || '')
  }, [client])

  async function handleSave() {
    if (!client) return
    const trimmed = name.trim()
    if (!trimmed) {
      setStatus('Name is required.')
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      await updateClient(client.id, { name: trimmed, notes: notes.trim() || null })
      await qc.invalidateQueries({ queryKey: qk.client(client.id) })
      await qc.invalidateQueries({ queryKey: qk.clients })
      setStatus('Saved.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to update client')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!client || saving) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this client? This cannot be undone.')) return
    setSaving(true)
    setStatus(null)
    try {
      await deleteClient(client.id)
      await qc.invalidateQueries({ queryKey: qk.clients })
      router.push('/clients')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to delete client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title={client ? client.name : 'Client'} subtitle="Customer profile and related projects.">
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 750 }}>Client details</div>
              <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>ID: {client?.id ?? '—'}</div>
            </div>
            <Link href="/clients" style={{ color: '#334155', fontWeight: 700, textDecoration: 'none' }}>← Back to clients</Link>
          </div>
          {isLoading ? <div style={{ color: '#64748b' }}>Loading…</div> : null}
          {error ? <div style={{ color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load client'}</div> : null}
          {client ? (
            <div style={{ display: 'grid', gap: 12, maxWidth: 540 }}>
              <label style={field}><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} style={input} /></label>
              <label style={field}><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...input, minHeight: 120, resize: 'vertical' }} /></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => void handleSave()} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save changes'}</button>
                <button onClick={() => void handleDelete()} disabled={saving} style={dangerBtn}>{saving ? 'Working…' : 'Delete client'}</button>
                {status ? <span style={{ color: status === 'Saved.' ? '#166534' : '#991b1b', fontWeight: 600 }}>{status}</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
          <div style={panelHeader}>Projects</div>
          {client?.projects.length ? (
            client.projects.map((project) => {
              const projectHref = project.archivedAt ? `/projects/${project.id}?archived=true` : `/projects/${project.id}`
              return (
                <div key={project.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 140px', padding: '14px 18px', borderBottom: '1px solid #eef2f7', alignItems: 'center' }}>
                  <Link href={projectHref} style={{ fontWeight: 700, textDecoration: 'none', color: '#0f172a' }}>{project.name}</Link>
                  <div style={{ color: '#475569' }}>{project.lead}</div>
                  <div style={{ color: '#475569' }}>{project.tasks} tasks</div>
                  <div>
                    {project.archivedAt ? <span style={pill('#e2e8f0', '#475569')}>Archived</span> : <span style={pill(project.status === 'Review' ? '#fef3c7' : '#dcfce7', project.status === 'Review' ? '#92400e' : '#166534')}>{project.status}</span>}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={{ padding: 18, color: '#64748b' }}>No projects yet.</div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

const field: React.CSSProperties = { display: 'grid', gap: 6, fontWeight: 600, color: '#334155' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 12px', background: '#fff', fontWeight: 500 }
const primaryBtn: React.CSSProperties = { background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const dangerBtn: React.CSSProperties = { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const panelHeader: React.CSSProperties = { padding: '16px 18px', fontWeight: 750, fontSize: 14, borderBottom: '1px solid #eef2f7', color: '#64748b' }
