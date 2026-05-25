'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getApiMcpKeyPolicy, getEdition, saveApiMcpKeyPolicy } from '../lib/api'
import { hasFeature, type EditionInfo } from '../lib/edition'
import { EnterpriseLockedCard } from './enterprise-locked-card'

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const labelStyle = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }

function parseDays(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const days = Number(trimmed)
  return Number.isFinite(days) ? Math.max(1, Math.min(3650, Math.floor(days))) : null
}

export function ApiMcpKeyPolicyPanel() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [requireApiKeyExpiry, setRequireApiKeyExpiry] = useState(false)
  const [requireMcpKeyExpiry, setRequireMcpKeyExpiry] = useState(false)
  const [apiKeyDefaultExpiresInDays, setApiKeyDefaultExpiresInDays] = useState('')
  const [apiKeyMaxExpiresInDays, setApiKeyMaxExpiresInDays] = useState('')
  const [mcpKeyDefaultExpiresInDays, setMcpKeyDefaultExpiresInDays] = useState('')
  const [mcpKeyMaxExpiresInDays, setMcpKeyMaxExpiresInDays] = useState('')
  const [restrictApiKeyCreationToAdmins, setRestrictApiKeyCreationToAdmins] = useState(false)
  const [restrictMcpKeyCreationToAdmins, setRestrictMcpKeyCreationToAdmins] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const enabled = hasFeature(edition, 'security.apiMcpKeyPolicy')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await getEdition()
      setEdition(info)
      if (!hasFeature(info, 'security.apiMcpKeyPolicy')) return
      const result = await getApiMcpKeyPolicy()
      const policy = result.policy
      setRequireApiKeyExpiry(policy.requireApiKeyExpiry)
      setRequireMcpKeyExpiry(policy.requireMcpKeyExpiry)
      setApiKeyDefaultExpiresInDays(policy.apiKeyDefaultExpiresInDays?.toString() ?? '')
      setApiKeyMaxExpiresInDays(policy.apiKeyMaxExpiresInDays?.toString() ?? '')
      setMcpKeyDefaultExpiresInDays(policy.mcpKeyDefaultExpiresInDays?.toString() ?? '')
      setMcpKeyMaxExpiresInDays(policy.mcpKeyMaxExpiresInDays?.toString() ?? '')
      setRestrictApiKeyCreationToAdmins(policy.restrictApiKeyCreationToAdmins)
      setRestrictMcpKeyCreationToAdmins(policy.restrictMcpKeyCreationToAdmins)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load key policy')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await saveApiMcpKeyPolicy({
        requireApiKeyExpiry,
        requireMcpKeyExpiry,
        apiKeyDefaultExpiresInDays: parseDays(apiKeyDefaultExpiresInDays),
        apiKeyMaxExpiresInDays: parseDays(apiKeyMaxExpiresInDays),
        mcpKeyDefaultExpiresInDays: parseDays(mcpKeyDefaultExpiresInDays),
        mcpKeyMaxExpiresInDays: parseDays(mcpKeyMaxExpiresInDays),
        restrictApiKeyCreationToAdmins,
        restrictMcpKeyCreationToAdmins,
      })
      setNotice('API and MCP key policy saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key policy')
    } finally {
      setWorking(false)
    }
  }

  if (!loading && !enabled) {
    return (
      <EnterpriseLockedCard title="API & MCP key policy" description="Control API and MCP key creation, expiry, rotation, and admin-only restrictions.">
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Visible in Community; editable in Enterprise.</div>
      </EnterpriseLockedCard>
    )
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>API & MCP key policy</h3>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>Enterprise defaults and guardrails for personal API keys and hosted MCP keys.</p>
      </div>
      {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
      {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label style={labelStyle}>API default expiry days<input inputMode="numeric" value={apiKeyDefaultExpiresInDays} onChange={(event) => setApiKeyDefaultExpiresInDays(event.target.value)} placeholder="No default" style={inputStyle} /></label>
          <label style={labelStyle}>API max expiry days<input inputMode="numeric" value={apiKeyMaxExpiresInDays} onChange={(event) => setApiKeyMaxExpiresInDays(event.target.value)} placeholder="No maximum" style={inputStyle} /></label>
          <label style={labelStyle}>MCP default expiry days<input inputMode="numeric" value={mcpKeyDefaultExpiresInDays} onChange={(event) => setMcpKeyDefaultExpiresInDays(event.target.value)} placeholder="No default" style={inputStyle} /></label>
          <label style={labelStyle}>MCP max expiry days<input inputMode="numeric" value={mcpKeyMaxExpiresInDays} onChange={(event) => setMcpKeyMaxExpiresInDays(event.target.value)} placeholder="No maximum" style={inputStyle} /></label>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={requireApiKeyExpiry} onChange={(event) => setRequireApiKeyExpiry(event.target.checked)} /> Require API keys to expire</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={requireMcpKeyExpiry} onChange={(event) => setRequireMcpKeyExpiry(event.target.checked)} /> Require MCP keys to expire</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={restrictApiKeyCreationToAdmins} onChange={(event) => setRestrictApiKeyCreationToAdmins(event.target.checked)} /> Restrict API key creation to platform admins</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={restrictMcpKeyCreationToAdmins} onChange={(event) => setRestrictMcpKeyCreationToAdmins(event.target.checked)} /> Restrict MCP key creation to platform admins</label>
        <button type="submit" disabled={working || loading} style={{ justifySelf: 'start', border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Save key policy</button>
      </form>
    </section>
  )
}
