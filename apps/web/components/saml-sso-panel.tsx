'use client'

import { FormEvent, useEffect, useState } from 'react'
import { deleteSamlIdentityProvider, getEdition, getSamlIdentityProvider, samlLoginUrl, samlMetadataUrl, saveSamlIdentityProvider } from '../lib/api'
import { hasFeature, type EditionInfo } from '../lib/edition'
import { EnterpriseLockedCard } from './enterprise-locked-card'

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const labelStyle = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }

export function SamlSsoPanel() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [entityId, setEntityId] = useState('')
  const [ssoUrl, setSsoUrl] = useState('')
  const [certificate, setCertificate] = useState('')
  const [allowedDomains, setAllowedDomains] = useState('')
  const [jitProvisioning, setJitProvisioning] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [enforceSso, setEnforceSso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const samlEnabled = hasFeature(edition, 'security.saml')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await getEdition()
      setEdition(info)
      if (!hasFeature(info, 'security.saml')) return
      const result = await getSamlIdentityProvider()
      if (result.config) {
        setEntityId(result.config.entityId)
        setSsoUrl(result.config.ssoUrl)
        setCertificate(result.config.certificate)
        setAllowedDomains(result.config.allowedDomains.join(', '))
        setJitProvisioning(result.config.jitProvisioning)
        setEnabled(result.config.enabled)
        setEnforceSso(result.config.enforceSso)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SAML configuration')
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
      await saveSamlIdentityProvider({ entityId, ssoUrl, certificate, allowedDomains: allowedDomains.split(',').map((domain) => domain.trim()).filter(Boolean), jitProvisioning, enabled, enforceSso })
      setNotice('SAML SSO configuration saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SAML configuration')
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete the SAML SSO configuration? Local superadmin login remains available.')) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await deleteSamlIdentityProvider()
      setEntityId('')
      setSsoUrl('')
      setCertificate('')
      setAllowedDomains('')
      setJitProvisioning(false)
      setEnabled(false)
      setEnforceSso(false)
      setNotice('SAML SSO configuration deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete SAML configuration')
    } finally {
      setWorking(false)
    }
  }

  if (!loading && !samlEnabled) {
    return (
      <EnterpriseLockedCard title="SAML / SSO" description="Connect Sally to a company identity provider, configure IdP metadata, enable SSO, and optionally enforce SSO while keeping a break-glass superadmin account.">
        <div style={{ display: 'grid', gap: 8, color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>
          <div>Visible in Community; editable in Enterprise.</div>
          <div>Fields: Entity ID, SSO URL, signing certificate, enable toggle, enforce SSO toggle.</div>
        </div>
      </EnterpriseLockedCard>
    )
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 'var(--font-16)' }}>SAML / SSO</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.55 }}>Enterprise identity provider configuration. Login flow wiring comes next.</p>
        </div>
        <span style={{ border: '1px solid rgba(110,231,183,0.35)', borderRadius: 999, padding: '4px 8px', color: '#6ee7b7', fontSize: 'var(--font-11)', fontWeight: 700 }}>Enterprise</span>
      </div>
      {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
      {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
      <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: 'var(--form-bg)', border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>
        <div><strong style={{ color: 'var(--text-primary)' }}>SP metadata:</strong> <code>{samlMetadataUrl()}</code></div>
        <div><strong style={{ color: 'var(--text-primary)' }}>Login URL:</strong> <code>{samlLoginUrl()}</code></div>
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label style={labelStyle}>IdP Entity ID<input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="https://idp.example.com/entity" style={inputStyle} /></label>
        <label style={labelStyle}>SSO URL<input value={ssoUrl} onChange={(event) => setSsoUrl(event.target.value)} placeholder="https://idp.example.com/sso" style={inputStyle} /></label>
        <label style={labelStyle}>Signing certificate<textarea value={certificate} onChange={(event) => setCertificate(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" rows={5} style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} /></label>
        <label style={labelStyle}>Allowed email domains<input value={allowedDomains} onChange={(event) => setAllowedDomains(event.target.value)} placeholder="example.com, subsidiary.com" style={inputStyle} /><span style={{ color: 'var(--text-muted)' }}>Optional. Leave empty to allow any matching Sally account. Separate domains with commas.</span></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={jitProvisioning} onChange={(event) => setJitProvisioning(event.target.checked)} /> Provision missing SAML accounts automatically</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable SAML SSO</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={enforceSso} onChange={(event) => setEnforceSso(event.target.checked)} /> Enforce SSO for non-superadmin users</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" disabled={working || loading} style={{ border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Save SAML configuration</button>
          <button type="button" disabled={working || loading} onClick={remove} style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'transparent', color: '#fecaca', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Delete configuration</button>
        </div>
      </form>
    </section>
  )
}
