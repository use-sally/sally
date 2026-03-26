'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Membership } from '../lib/auth'
import { loadSession } from '../lib/auth'
import { apiUrl, createApiKey, createMcpKey, getApiKeys, getMcpKeys, revokeApiKey, revokeMcpKey } from '../lib/api'
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
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [apiKeyLabel, setApiKeyLabel] = useState('')
  const [mcpKeyLabel, setMcpKeyLabel] = useState('')
  const [mcpWorkspaceId, setMcpWorkspaceId] = useState<string>('')
  const [apiKeySecret, setApiKeySecret] = useState<string | null>(null)
  const [mcpKeySecret, setMcpKeySecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const endpoint = apiUrl('/mcp')
  const hostedConfig = useMemo(() => JSON.stringify({ sally: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer YOUR_HOSTED_MCP_KEY' } } }, null, 2), [endpoint])
  const restrictedWorkspace = memberships.find((membership) => membership.workspaceId === mcpWorkspaceId)

  const loadKeys = async () => {
    setLoading(true)
    setError(null)
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
    setMemberships(loadSession()?.memberships ?? [])
    void loadKeys()
  }, [])

  const copyValue = async (value: string, kind: string) => {
    setError(null)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setError('Copy failed. Please copy it manually.')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...panel, display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontWeight: 750 }}>Hosted MCP</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            This is the primary path. Create a hosted MCP key here, copy the endpoint/config below, and point your agent or MCP client at Sally directly. The older local `sally-mcp` stdio route is still possible for advanced setups, but it is intentionally de-emphasized.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <CopyRow label="Hosted endpoint" value={endpoint} copied={copied === 'endpoint'} onCopy={() => void copyValue(endpoint, 'endpoint')} />
          <CopyBlock label="Example MCP config" value={hostedConfig} copied={copied === 'config'} onCopy={() => void copyValue(hostedConfig, 'config')} />
        </div>

        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: 'var(--form-bg)', border: '1px solid var(--panel-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Recommended flow</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
            <li>Create a hosted MCP key.</li>
            <li>Copy the endpoint or config snippet.</li>
            <li>Paste the new key into your MCP client as a Bearer token.</li>
            <li>If you want stricter scope, create the key with a workspace restriction.</li>
          </ol>
        </div>
      </div>

      <KeySection
        title="Hosted MCP keys"
        description="Hosted MCP keys use your Sally permissions. Optionally restrict a key to a single workspace to reduce accidental cross-workspace access."
        createLabel={mcpKeyLabel}
        setCreateLabel={setMcpKeyLabel}
        secret={mcpKeySecret}
        copied={copied === 'mcp'}
        loading={loading}
        error={error}
        beforeForm={
          <label style={{ display: 'grid', gap: 6, minWidth: 260, flex: 1 }}>
            <span style={fieldLabel}>Workspace restriction</span>
            <select value={mcpWorkspaceId} onChange={(event) => setMcpWorkspaceId(event.target.value)} style={inputStyle}>
              <option value="">All accessible workspaces</option>
              {memberships.map((membership) => (
                <option key={membership.workspaceId} value={membership.workspaceId}>{membership.workspaceName}</option>
              ))}
            </select>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {restrictedWorkspace
                ? `This key will only work inside ${restrictedWorkspace.workspaceName}.`
                : 'Leave this open if the client needs access to every workspace your Sally user can reach.'}
            </span>
          </label>
        }
        onCreate={async () => {
          const created = await createMcpKey({ label: mcpKeyLabel.trim(), workspaceId: mcpWorkspaceId || null })
          setMcpKeySecret(created.key)
          setMcpKeyLabel('')
          await loadKeys()
        }}
        onCopy={() => mcpKeySecret ? void copyValue(mcpKeySecret, 'mcp') : undefined}
        createButton="Create hosted MCP key"
        emptyText="No hosted MCP keys yet."
        secretTitle="New hosted MCP key"
        placeholder="e.g. Claude hosted MCP, OpenClaw"
        items={mcpKeys}
        renderMeta={(key) => `${key.prefix}… · created ${new Date(key.createdAt).toLocaleString()}${key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}` : ''}${key.workspaceName ? ` · restricted to ${key.workspaceName}` : ' · all workspaces'}${key.revokedAt ? ' · revoked' : ''}`}
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
        onCopy={() => apiKeySecret ? void copyValue(apiKeySecret, 'api') : undefined}
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
  beforeForm,
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
  beforeForm?: ReactNode
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
        {beforeForm}
        <label style={{ display: 'grid', gap: 6, minWidth: 260, flex: 1 }}>
          <span style={fieldLabel}>Label</span>
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

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={fieldLabel}>{label}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{ ...copySurface, flex: 1 }}>{value}</code>
        <button type="button" onClick={onCopy} style={smallButton}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  )
}

function CopyBlock({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={fieldLabel}>{label}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        <pre style={{ ...copySurface, margin: 0, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{value}</pre>
        <div>
          <button type="button" onClick={onCopy} style={smallButton}>{copied ? 'Copied' : 'Copy config'}</button>
        </div>
      </div>
    </div>
  )
}

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--form-border)',
  fontSize: 14,
  background: 'var(--form-bg)',
  color: 'var(--form-text)',
}

const primaryButton: CSSProperties = {
  background: 'var(--form-bg)',
  color: 'var(--form-text)',
  border: 'none',
  borderRadius: 12,
  padding: '11px 14px',
  fontWeight: 700,
}

const smallButton: CSSProperties = {
  borderRadius: 10,
  border: '1px solid var(--form-border)',
  padding: '6px 10px',
  fontWeight: 700,
  background: 'var(--form-bg)',
  color: 'var(--text-primary)',
}

const copySurface: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--panel-border)',
  background: 'var(--form-bg)',
  color: 'var(--text-primary)',
  fontSize: 13,
  wordBreak: 'break-all',
}
