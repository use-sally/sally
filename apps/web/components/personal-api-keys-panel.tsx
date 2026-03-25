'use client'

import { useEffect, useState } from 'react'
import { createApiKey, getApiKeys, revokeApiKey } from '../lib/api'
import { panel } from './app-shell'

type ApiKeyItem = {
  id: string
  label: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export function PersonalApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([])
  const [apiKeyLabel, setApiKeyLabel] = useState('')
  const [apiKeySecret, setApiKeySecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadApiKeys = async () => {
    setLoading(true)
    try {
      setApiKeys(await getApiKeys())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadApiKeys()
  }, [])

  const handleCreateApiKey = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!apiKeyLabel.trim()) {
      setError('API key label is required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const created = await createApiKey({ label: apiKeyLabel.trim() })
      setApiKeySecret(created.key)
      setApiKeyLabel('')
      await loadApiKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key')
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeApiKey = async (apiKeyId: string) => {
    if (!window.confirm('Revoke this API key? Any tool using it will stop working immediately.')) return
    setRevokingId(apiKeyId)
    setError(null)
    try {
      await revokeApiKey(apiKeyId)
      await loadApiKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key')
    } finally {
      setRevokingId(null)
    }
  }

  const handleCopyKey = async () => {
    if (!apiKeySecret) return
    setError(null)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(apiKeySecret)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = apiKeySecret
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Copy failed. Please copy the key manually.')
    }
  }

  return (
    <div style={{ ...panel, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 750 }}>Personal API keys</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Create your own key to use the PM tool from external clients. Keys are only shown once when created.</div>
      </div>
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {apiKeySecret ? (
        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>New API key</div>
          <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{apiKeySecret}</code>
          <div>
            <button onClick={() => void handleCopyKey()} style={{ borderRadius: 10, border: '1px solid var(--form-border)', padding: '6px 10px', fontWeight: 700, background: 'var(--form-bg)' }}>{copied ? 'Copied' : 'Copy key'}</button>
          </div>
        </div>
      ) : null}
      <form onSubmit={handleCreateApiKey} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 6, minWidth: 260, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Label</span>
          <input value={apiKeyLabel} onChange={(event) => setApiKeyLabel(event.target.value)} placeholder="e.g. Claude desktop, Zapier, n8n" style={inputStyle} />
        </label>
        <button type="submit" disabled={loading || !apiKeyLabel.trim()} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>
          {loading ? 'Creating…' : 'Create API key'}
        </button>
      </form>
      <div style={{ display: 'grid', gap: 8 }}>
        {apiKeys.map((key) => (
          <div key={key.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px', borderBottom: '1px solid var(--panel-border)' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>{key.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{key.prefix}… · created {new Date(key.createdAt).toLocaleString()}{key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}` : ''}{key.revokedAt ? ' · revoked' : ''}</div>
            </div>
            <button onClick={() => void handleRevokeApiKey(key.id)} disabled={revokingId === key.id || !!key.revokedAt} style={{ borderRadius: 10, border: '1px solid var(--form-border)', padding: '6px 10px', fontWeight: 700, background: 'var(--form-bg)', color: 'var(--text-primary)' }}>
              {key.revokedAt ? 'Revoked' : revokingId === key.id ? 'Revoking…' : 'Revoke'}
            </button>
          </div>
        ))}
        {!apiKeys.length && !loading ? <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No API keys yet.</div> : null}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--form-border)',
  fontSize: 14,
}
