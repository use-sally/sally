'use client'

import { useEffect, useState } from 'react'
import { createApiKey, createMcpKey, getApiKeys, getMcpKeys, revokeApiKey, revokeMcpKey } from '../lib/api'
import { panel } from './app-shell'

type KeyItem = {
  id: string
  label: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

type McpKeyItem = KeyItem & {
  workspaceId: string | null
  workspaceSlug: string | null
  workspaceName: string | null
}

export function PersonalApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<KeyItem[]>([])
  const [mcpKeys, setMcpKeys] = useState<McpKeyItem[]>([])
  const [apiKeyLabel, setApiKeyLabel] = useState('')
  const [mcpKeyLabel, setMcpKeyLabel] = useState('')
  const [apiKeySecret, setApiKeySecret] = useState<string | null>(null)
  const [mcpKeySecret, setMcpKeySecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadKeys = async () => {
    setLoading(true)
    try {
      const [api, mcp] = await Promise.all([getApiKeys(), getMcpKeys()])
      setApiKeys(api)
      setMcpKeys(mcp)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadKeys()
  }, [])

  const copySecret = async (secret: string, kind: 'api' | 'mcp') => {
    setError(null)
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setError('Copy failed. Please copy the key manually.')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <KeySection
        title="Hosted MCP keys"
        description="Use these with Sally's hosted MCP endpoint. Permissions come from your Sally user. Backend workspace restriction is supported on the API now; UI workspace picker can come next."
        createLabel={mcpKeyLabel}
        setCreateLabel={setMcpKeyLabel}
        secret={mcpKeySecret}
        copied={copied === 'mcp'}
        loading={loading}
        error={error}
        onCreate={async () => {
          const created = await createMcpKey({ label: mcpKeyLabel.trim() })
          setMcpKeySecret(created.key)
          setMcpKeyLabel('')
          await loadKeys()
        }}
        onCopy={() => mcpKeySecret ? void copySecret(mcpKeySecret, 'mcp') : undefined}
        createButton="Create hosted MCP key"
        emptyText="No hosted MCP keys yet."
        secretTitle="New hosted MCP key"
        placeholder="e.g. Claude hosted MCP, OpenClaw"
        items={mcpKeys}
        renderMeta={(key) => `${key.prefix}… · created ${new Date(key.createdAt).toLocaleString()}${key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}` : ''}${key.workspaceName ? ` · workspace ${key.workspaceName}` : ''}${key.revokedAt ? ' · revoked' : ''}`}
        onRevoke={async (id) => { await revokeMcpKey(id); await loadKeys() }}
      />

      <KeySection
        title="Personal API keys"
        description="Use these against Sally's normal REST API. Keys are shown once when created."
        createLabel={apiKeyLabel}
        setCreateLabel={setApiKeyLabel}
        secret={apiKeySecret}
        copied={copied === 'api'}
        loading={loading}
        error={error}
        onCreate={async () => {
          const created = await createApiKey({ label: apiKeyLabel.trim() })
          setApiKeySecret(created.key)
          setApiKeyLabel('')
          await loadKeys()
        }}
        onCopy={() => apiKeySecret ? void copySecret(apiKeySecret, 'api') : undefined}
        createButton="Create API key"
        emptyText="No API keys yet."
        secretTitle="New API key"
        placeholder="e.g. Zapier, n8n"
        items={apiKeys}
        renderMeta={(key) => `${key.prefix}… · created ${new Date(key.createdAt).toLocaleString()}${key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}` : ''}${key.revokedAt ? ' · revoked' : ''}`}
        onRevoke={async (id) => { await revokeApiKey(id); await loadKeys() }}
      />
    </div>
  )
}

function KeySection({
  title,
  description,
  createLabel,
  setCreateLabel,
  secret,
  copied,
  loading,
  error,
  onCreate,
  onCopy,
  createButton,
  emptyText,
  secretTitle,
  placeholder,
  items,
  renderMeta,
  onRevoke,
}: {
  title: string
  description: string
  createLabel: string
  setCreateLabel: (value: string) => void
  secret: string | null
  copied: boolean
  loading: boolean
  error: string | null
  onCreate: () => Promise<void>
  onCopy: () => void
  createButton: string
  emptyText: string
  secretTitle: string
  placeholder: string
  items: Array<KeyItem | McpKeyItem>
  renderMeta: (key: any) => string
  onRevoke: (id: string) => Promise<void>
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null)

  return (
    <div style={{ ...panel, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontWeight: 750 }}>{title}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{description}</div>
      </div>
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {secret ? (
        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{secretTitle}</div>
          <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{secret}</code>
          <div>
            <button onClick={onCopy} style={smallButton}>{copied ? 'Copied' : 'Copy key'}</button>
          </div>
        </div>
      ) : null}
      <form onSubmit={(event) => { event.preventDefault(); if (createLabel.trim()) void onCreate() }} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 6, minWidth: 260, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Label</span>
          <input value={createLabel} onChange={(event) => setCreateLabel(event.target.value)} placeholder={placeholder} style={inputStyle} />
        </label>
        <button type="submit" disabled={loading || !createLabel.trim()} style={primaryButton}>{loading ? 'Creating…' : createButton}</button>
      </form>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((key) => (
          <div key={key.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px', borderBottom: '1px solid var(--panel-border)' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>{key.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{renderMeta(key)}</div>
            </div>
            <button onClick={() => void (async () => { if (!window.confirm('Revoke this key? Any connected tool will stop working immediately.')) return; setRevokingId(key.id); try { await onRevoke(key.id) } finally { setRevokingId(null) } })()} disabled={revokingId === key.id || !!key.revokedAt} style={smallButton}>
              {key.revokedAt ? 'Revoked' : revokingId === key.id ? 'Revoking…' : 'Revoke'}
            </button>
          </div>
        ))}
        {!items.length && !loading ? <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{emptyText}</div> : null}
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

const primaryButton: React.CSSProperties = {
  background: 'var(--form-bg)',
  color: 'var(--form-text)',
  border: 'none',
  borderRadius: 12,
  padding: '11px 14px',
  fontWeight: 700,
}

const smallButton: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid var(--form-border)',
  padding: '6px 10px',
  fontWeight: 700,
  background: 'var(--form-bg)',
  color: 'var(--text-primary)',
}
