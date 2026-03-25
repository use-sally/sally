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

const ADD_NEW_CLIENT_VALUE = '__add_new_client__'

export function ClientPicker({ value, onChange }: ClientPickerProps) {
  const { data: clients } = useClientsQuery()
  const qc = useQueryClient()
  const [newClientName, setNewClientName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addingNewClient, setAddingNewClient] = useState(false)
  const showInlineCreate = addingNewClient

  async function handleAdd() {
    if (!newClientName.trim() || creating) return
    try {
      setCreating(true)
      setError(null)
      const result = await createClient({ name: newClientName.trim() })
      setNewClientName('')
      setAddingNewClient(false)
      onChange(result.clientId)
      await qc.invalidateQueries({ queryKey: qk.clients })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add client')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={field}>
        <span>Client</span>
        <select value={showInlineCreate ? ADD_NEW_CLIENT_VALUE : value} onChange={(e) => {
          setError(null)
          if (e.target.value === ADD_NEW_CLIENT_VALUE) {
            setAddingNewClient(true)
            return
          }
          setAddingNewClient(false)
          onChange(e.target.value)
        }} style={input}>
          <option value="">No client / internal</option>
          {(clients || []).map((client) => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
          <option value={ADD_NEW_CLIENT_VALUE}>Add new client</option>
        </select>
        <span style={helperText}>Attach work to a customer to make reporting and handoffs easier.</span>
      </label>
      {showInlineCreate ? (
        <input
          autoFocus
          value={newClientName}
          onChange={(e) => setNewClientName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }}
          placeholder="Add client name and press Enter"
          style={input}
        />
      ) : null}
      {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
    </div>
  )
}

const field: React.CSSProperties = { display: 'grid', gap: 6, fontWeight: 600, color: 'rgba(209, 250, 229, 0.72)' }
const input: React.CSSProperties = { width: '100%', border: '1px solid var(--form-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--form-bg)', fontWeight: 500 }
const helperText: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }
