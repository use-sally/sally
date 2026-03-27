'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell, panel } from '../../components/app-shell'
import { createClient } from '../../lib/api'
import { getWorkspaceId, loadSession } from '../../lib/auth'
import { canManageClients } from '../../lib/client-permissions'
import { qk, useClientsQuery } from '../../lib/query'
import { labelText, projectInputField } from '../../lib/theme'

export default function ClientsPage() {
  const qc = useQueryClient()
  const { data: clients = [], error } = useClientsQuery()
  const session = useMemo(() => loadSession(), [])
  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const manageClientsDecision = canManageClients({ platformRole: session?.account?.platformRole ?? null, workspaceRole })
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    try {
      setCreating(true)
      setStatus(null)
      const result = await createClient({ name: trimmed, notes: notes.trim() || undefined })
      setName('')
      setNotes('')
      if (result.existing) {
        setStatus(`Client "${trimmed}" already exists.`)
      }
      await qc.invalidateQueries({ queryKey: qk.clients })
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to create client')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppShell title="Clients" subtitle="Customer directory for projects and reporting.">
      <div style={{ display: 'grid', gap: 18 }}>
        {manageClientsDecision.visible ? <div style={panel}>
          <div style={{ fontWeight: 750, marginBottom: 12 }}>Add client</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={field}><span style={labelText}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" style={input} /></label>
            <label style={field}><span style={labelText}>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" style={{ ...input, minHeight: 90, resize: 'vertical' }} /></label>
            {status ? <div style={{ color: status.includes('exists') ? '#9a3412' : '#b91c1c' }}>{status}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => void handleCreate()} disabled={!manageClientsDecision.allowed || !name.trim() || creating} style={primaryBtn}>{creating ? 'Adding…' : 'Add client'}</button>
            </div>
          </div>
        </div> : null}

        <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
          <div style={panelHeader}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 160px' }}>
              <div>Name</div><div>Notes</div><div>Projects</div>
            </div>
          </div>
          {clients.map((client) => (
            <div key={client.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 160px', padding: '14px 18px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-primary)', alignItems: 'center' }}>
              <Link href={`/clients/${client.id}`} style={{ fontWeight: 700, textDecoration: 'none', color: 'var(--text-primary)' }}>{client.name}</Link>
              <div style={{ color: 'var(--text-secondary)' }}>{client.notes || '—'}</div>
              <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{client.projectCount}</div>
            </div>
          ))}
          {!clients.length && !error ? <div style={{ padding: 18, color: 'var(--text-muted)' }}>No clients yet.</div> : null}
          {error ? <div style={{ padding: 18, color: 'var(--danger-text)' }}>{error instanceof Error ? error.message : 'Failed to load clients'}</div> : null}
        </div>
      </div>
    </AppShell>
  )
}

const field: React.CSSProperties = { display: 'grid', gap: 6 }
const input: React.CSSProperties = { ...projectInputField, fontWeight: 500 }
const primaryBtn: React.CSSProperties = { background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const panelHeader: React.CSSProperties = { padding: '16px 18px', fontWeight: 750, fontSize: 14, borderBottom: '1px solid rgba(16, 185, 129, 0.10)', color: 'var(--text-muted)' }
