'use client'

import { useEffect, useState } from 'react'
import type { AccountIntegrationStatus, CloudStorageProviderConfig } from '@sally/types/src'
import { getCloudStorageProviderConfig, getIntegrationConnectUrl, updateCloudStorageProviderConfig } from '../lib/api'
import { labelText, projectInputField } from '../lib/theme'

function providerLabel(provider: CloudStorageProviderConfig['provider']) {
  if (provider === 'GOOGLE_DRIVE') return 'Google Drive'
  if (provider === 'MICROSOFT_365') return 'Microsoft 365'
  return 'Dropbox'
}

function providerSlug(provider: CloudStorageProviderConfig['provider']): AccountIntegrationStatus['slug'] {
  if (provider === 'GOOGLE_DRIVE') return 'google-drive'
  if (provider === 'MICROSOFT_365') return 'microsoft-365'
  return 'dropbox'
}

export function CloudStorageIntegrationsPanel() {
  const [providers, setProviders] = useState<Array<CloudStorageProviderConfig & { clientSecret?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connectingProvider, setConnectingProvider] = useState<CloudStorageProviderConfig['provider'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getCloudStorageProviderConfig()
      setProviders(response.providers.map((provider) => ({ ...provider, clientSecret: '' })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cloud storage configuration')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const updateProvider = (provider: CloudStorageProviderConfig['provider'], patch: Partial<CloudStorageProviderConfig & { clientSecret: string }>) => {
    setProviders((current) => current.map((item) => item.provider === provider ? { ...item, ...patch } : item))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      await updateCloudStorageProviderConfig(providers.map((provider) => ({ provider: provider.provider, enabled: provider.enabled, clientId: provider.clientId, clientSecret: provider.clientSecret || undefined, tenantId: provider.tenantId || undefined })))
      setInfo('Cloud storage provider settings saved. Users can connect their accounts from Profile → Connected storage, or use Connect my account below.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save cloud storage configuration')
    } finally {
      setSaving(false)
    }
  }

  const saveAndConnect = async (provider: CloudStorageProviderConfig['provider']) => {
    setSaving(true)
    setConnectingProvider(provider)
    setError(null)
    setInfo(null)
    try {
      await updateCloudStorageProviderConfig(providers.map((item) => ({ provider: item.provider, enabled: item.enabled, clientId: item.clientId, clientSecret: item.clientSecret || undefined, tenantId: item.tenantId || undefined })))
      const response = await getIntegrationConnectUrl(providerSlug(provider))
      window.location.href = response.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth connection')
      setSaving(false)
      setConnectingProvider(null)
    }
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>Cloud storage integrations</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>Enterprise-only provider credentials for Google Drive, Microsoft 365, and Dropbox. Secrets are encrypted before storage.</p>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving || loading} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {info ? <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{info}</div> : null}
      {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div> : null}
      <div style={{ display: 'grid', gap: 10 }}>
        {providers.map((provider) => (
          <div key={provider.provider} style={{ border: '1px solid var(--panel-border)', borderRadius: 14, padding: 14, display: 'grid', gap: 10, background: 'var(--form-bg)' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{providerLabel(provider.provider)}</div>
                <div style={{ ...labelText, marginTop: 3 }}>{provider.configured ? 'Configured' : 'Missing client id or secret'} · Redirect URI: {provider.redirectUri}</div>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={provider.enabled} onChange={(event) => updateProvider(provider.provider, { enabled: event.target.checked })} /> Enabled</span>
            </label>
            <input value={provider.clientId} onChange={(event) => updateProvider(provider.provider, { clientId: event.target.value })} placeholder="OAuth client id" style={projectInputField} />
            <input value={provider.clientSecret || ''} onChange={(event) => updateProvider(provider.provider, { clientSecret: event.target.value })} placeholder={provider.hasClientSecret ? 'Client secret stored — enter a new one to replace' : 'OAuth client secret'} type="password" style={projectInputField} />
            {provider.provider === 'MICROSOFT_365' ? <input value={provider.tenantId || 'common'} onChange={(event) => updateProvider(provider.provider, { tenantId: event.target.value })} placeholder="Tenant id, e.g. common or organizations" style={projectInputField} /> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>OAuth consent is per user. Use this to connect your own account after saving provider credentials.</div>
              <button type="button" onClick={() => void saveAndConnect(provider.provider)} disabled={saving || loading || !provider.enabled || !provider.clientId || (!provider.hasClientSecret && !provider.clientSecret)} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '9px 11px', fontWeight: 700 }}>{connectingProvider === provider.provider ? 'Opening OAuth…' : 'Save & connect my account'}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
