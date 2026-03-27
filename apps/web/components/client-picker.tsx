'use client'

import type React from 'react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '../lib/api'
import { qk, useClientsQuery } from '../lib/query'
import { labelText, projectInputField } from '../lib/theme'

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={labelText}>Client</span>
          <details style={{ position: 'relative' }}>
            <summary style={{ listStyle: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>ⓘ</summary>
            <div style={{ position: 'absolute', right: 0, top: 20, zIndex: 2, width: 280, padding: 10, borderRadius: 12, border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', boxShadow: '0 12px 28px rgba(15,23,42,0.18)', ...helperPopoverText }}>
              Attach work to a customer to make reporting and handoffs easier.
            </div>
          </details>
        </div>
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

const field: React.CSSProperties = { display: 'grid', gap: 6 }
const input: React.CSSProperties = { ...projectInputField, fontWeight: 500 }
const helperPopoverText: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'none', letterSpacing: 'normal', lineHeight: 1.45 }
