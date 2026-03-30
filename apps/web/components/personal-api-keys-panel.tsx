'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Membership } from '../lib/auth'
import { loadSession } from '../lib/auth'
import { apiUrl, createApiKey, createMcpKey, getApiKeys, getMcpKeys, getRuntimeConfig, revokeApiKey, revokeMcpKey } from '../lib/api'
import { deleteTextAction, labelText, metaLabelText, projectInputField, sectionLabelText } from '../lib/theme'
import { panel } from './app-shell'
import { InfoFlag } from './info-flag'

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
  const [appBaseUrl, setAppBaseUrl] = useState<string | null>(null)

  const endpoint = apiUrl('/mcp')
  const displayEndpoint = useMemo(() => {
    if (/^https?:\/\//i.test(endpoint)) return endpoint
    if (appBaseUrl) return new URL('/api/mcp', appBaseUrl).toString()
    if (typeof window === 'undefined') return endpoint
    return new URL(endpoint, window.location.origin).toString()
  }, [endpoint, appBaseUrl])
  const hostedConfig = useMemo(() => JSON.stringify({ sally: { type: 'http', url: displayEndpoint, headers: { Authorization: 'Bearer YOUR_HOSTED_MCP_KEY' } } }, null, 2), [displayEndpoint])
  const restrictedWorkspace = memberships.find((membership) => membership.workspaceId === mcpWorkspaceId)

  const loadKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const [api, mcp, runtimeConfig] = await Promise.all([getApiKeys(), getMcpKeys(), getRuntimeConfig()])
      setApiKeys(api)
      setMcpKeys(mcp)
      setAppBaseUrl(runtimeConfig.appBaseUrl)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={sectionLabelText}>Hosted MCP</div>
          <InfoFlag text="This is the primary path. Create a hosted MCP key here, copy the endpoint/config below, and point your agent or MCP client at Sally directly. The older local sally-mcp stdio route is still possible for advanced setups, but it is intentionally de-emphasized." />
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <CopyRow label="Hosted endpoint" value={displayEndpoint} copied={copied === 'endpoint'} onCopy={() => void copyValue(displayEndpoint, 'endpoint')} />
          <CopyBlock label="Example MCP config" value={hostedConfig} copied={copied === 'config'} onCopy={() => void copyValue(hostedConfig, 'config')} />
        </div>

        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: 'var(--form-bg)', border: '1px solid var(--panel-border)' }}>
          <div style={metaLabelText}>Recommended flow</div>
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
        info="Hosted MCP keys use your Sally permissions. Optionally restrict a key to a single workspace to reduce accidental cross-workspace access."
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
            <span style={{ ...labelText, fontWeight: 500 }}>
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
        emptyText="No hosted MCP keys yet."
        secretTitle="New hosted MCP key"
        placeholder="e.g. Claude hosted MCP, OpenClaw"
        items={mcpKeys}
        renderMeta={(key) => `${key.prefix}… · created ${new Date(key.createdAt).toLocaleString()}${key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleString()}` : ''}${key.workspaceName ? ` · restricted to ${key.workspaceName}` : ' · all workspaces'}${key.revokedAt ? ' · revoked' : ''}`}
        onRevoke={async (id) => { await revokeMcpKey(id); await loadKeys() }}
      />

      <KeySection
        title="Personal API keys"
        info="Use these against Sally's normal REST API. Keys are shown once when created."
        description=""
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
  info,
  createLabel,
  setCreateLabel,
  secret,
  copied,
  loading,
  error,
  onCreate,
  onCopy,
  emptyText,
  secretTitle,
  placeholder,
  items,
  renderMeta,
  onRevoke,
  beforeForm,
}: {
  title: string
  description?: string
  info?: string
  createLabel: string
  setCreateLabel: (value: string) => void
  secret: string | null
  copied: boolean
  loading: boolean
  error: string | null
  onCreate: () => Promise<void>
  onCopy: () => void
  emptyText: string
  secretTitle: string
  placeholder: string
  items: Array<KeyItem | McpKeyItem>
  renderMeta: (key: any) => string
  onRevoke: (id: string) => Promise<void>
  beforeForm?: ReactNode
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const submitIfReady = () => {
    if (!loading && createLabel.trim()) void onCreate()
  }

  return (
    <div style={{ ...panel, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={sectionLabelText}>{title}</div>
          {info ? <InfoFlag text={info} /> : null}
        </div>
        {description ? <div style={{ ...labelText, fontSize: 13, fontWeight: 500 }}>{description}</div> : null}
      </div>
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {secret ? (
        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 14, background: 'var(--panel-bg)', border: '1px solid var(--panel-border)' }}>
          <div style={metaLabelText}>{secretTitle}</div>
          <button type="button" onClick={onCopy} style={{ ...copySurface, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }} title="Click to copy">
            <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{secret}</code>
          </button>
          <div style={{ ...labelText, color: copied ? 'var(--success-text)' : 'var(--text-muted)' }}>
            {copied ? 'Copied' : 'Click the key to copy it'}
          </div>
        </div>
      ) : null}
      <form onSubmit={(event) => { event.preventDefault(); if (createLabel.trim()) void onCreate() }} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {beforeForm}
        <label style={{ display: 'grid', gap: 6, minWidth: 260, flex: 1 }}>
          <span style={fieldLabel}>Label</span>
          <input
            value={createLabel}
            onChange={(event) => setCreateLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submitIfReady()
              }
            }}
            placeholder={placeholder}
            style={inputStyle}
          />
        </label>
      </form>
      <div style={{ ...labelText, color: loading ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
        {loading ? 'Creating…' : ''}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((key) => (
          <div key={key.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px', borderBottom: '1px solid var(--panel-border)' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontWeight: 600, color: 'var(--task-title)' }}>{key.label}</div>
              <div style={{ ...labelText, fontSize: 13, fontWeight: 500 }}>{renderMeta(key)}</div>
            </div>
            <button
              onClick={() => void (async () => {
                const message = key.revokedAt
                  ? 'Delete this revoked key permanently?'
                  : 'Revoke this key? Any connected tool will stop working immediately.'
                if (!window.confirm(message)) return
                setRevokingId(key.id)
                try {
                  await onRevoke(key.id)
                } finally {
                  setRevokingId(null)
                }
              })()}
              disabled={revokingId === key.id}
              style={{ ...deleteTextAction, opacity: revokingId === key.id ? 0.5 : 1 }}
            >
              {revokingId === key.id ? (key.revokedAt ? 'Deleting…' : 'Revoking…') : (key.revokedAt ? 'Delete' : 'Revoke')}
            </button>
          </div>
        ))}
        {!items.length && !loading ? <div style={{ ...labelText, fontSize: 14, fontWeight: 500 }}>{emptyText}</div> : null}
      </div>
    </div>
  )
}

function CopyRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={fieldLabel}>{label}</div>
      <button type="button" onClick={onCopy} style={{ ...copySurface, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }} title="Click to copy">
        <code>{value}</code>
      </button>
      <div style={{ ...labelText, color: copied ? 'var(--success-text)' : 'var(--text-muted)' }}>
        {copied ? 'Copied' : ''}
      </div>
    </div>
  )
}

function CopyBlock({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={fieldLabel}>{label}</div>
      <button type="button" onClick={onCopy} style={{ ...copySurface, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }} title="Click to copy">
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{value}</pre>
      </button>
      <div style={{ ...labelText, color: copied ? 'var(--success-text)' : 'var(--text-muted)' }}>
        {copied ? 'Copied' : 'Click the field to copy'}
      </div>
    </div>
  )
}

const fieldLabel: CSSProperties = metaLabelText

const inputStyle: CSSProperties = { ...projectInputField, height: 42, boxSizing: 'border-box', lineHeight: '20px' }

const copySurface: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--panel-border)',
  background: 'var(--form-bg)',
  color: 'var(--text-primary)',
  fontSize: 13,
  wordBreak: 'break-all',
}
