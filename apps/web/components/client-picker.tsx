'use client'

import type React from 'react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '../lib/api'
import { qk, useClientsQuery } from '../lib/query'

type ClientPickerProps = {
  value: string
  onChange: (clientId: string) => void
}

export function ClientPicker({ value, onChange }: ClientPickerProps) {
  const { data: clients } = useClientsQuery()
  const qc = useQueryClient()
  const [newClientName, setNewClientName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!newClientName.trim() || creating) return
    try {
      setCreating(true)
      setError(null)
      const result = await createClient({ name: newClientName.trim() })
      setNewClientName('')
      onChange(result.clientId)
      await qc.invalidateQueries({ queryKey: qk.clients })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add client')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <label style={field}>
        <span>Client</span>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={input}>
          <option value="">No client / internal</option>
          {(clients || []).map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
        <span style={helperText}>Attach work to a customer to make reporting and handoffs easier.</span>
      </label>
      <div style={newClientBox}>
        <div style={{ fontWeight: 600 }}>Need a new client?</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }}
            placeholder="Client name"
            style={input}
          />
        </div>
        <span style={helperText}>New clients become available immediately and stay available for other projects.</span>
        {error ? <div style={{ color: '#b91c1c', marginTop: 6 }}>{error}</div> : null}
      </div>
    </div>
  )
}

const field: React.CSSProperties = { display: 'grid', gap: 6, fontWeight: 600, color: '#334155' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 12px', background: '#fff', fontWeight: 500 }
const helperText: React.CSSProperties = { fontSize: 12, color: '#64748b', fontWeight: 500 }
const newClientBox: React.CSSProperties = { border: '1px dashed #dbe1ea', borderRadius: 14, padding: 12, display: 'grid', gap: 6, background: '#f8fafc' }
