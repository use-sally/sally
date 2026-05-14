'use client'

import { FormEvent, useEffect, useState } from 'react'
import { AppShell } from '../../components/app-shell'
import { activateLicense, getLicense, removeLicense, type InstalledLicenseSummary } from '../../lib/api'

function formatDate(value?: string | null) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString() } catch { return value }
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: 14, overflowWrap: 'anywhere' }}>{value || '—'}</span>
    </div>
  )
}

export default function EditionLicensePage() {
  const [license, setLicense] = useState<InstalledLicenseSummary | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getLicense()
      setLicense(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load license')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submitActivate = async (event: FormEvent) => {
    event.preventDefault()
    if (!licenseKey.trim()) {
      setError('Paste license key first.')
      return
    }
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await activateLicense({ licenseKey: licenseKey.trim() })
      setLicenseKey('')
      setNotice('License activated.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License activation failed')
    } finally {
      setWorking(false)
    }
  }

  const handleRemove = async () => {
    if (!window.confirm('Remove the installed license and return this instance to Community?')) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await removeLicense()
      setNotice('License removed. Instance is now Community unless an env override is configured.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License removal failed')
    } finally {
      setWorking(false)
    }
  }

  const editionLabel = license?.edition === 'ENTERPRISE' ? 'Enterprise' : 'Community'

  return (
    <AppShell title="Edition/License" subtitle="Install or remove this Sally instance license.">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 20, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>{loading ? 'Loading edition…' : editionLabel}</h2>
              <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                {license?.license?.source === 'env_override' ? 'Enterprise is enabled by environment override.' : license?.installed ? 'License certificate is stored in this Sally database.' : 'No installed license. This instance is running Community.'}
              </p>
            </div>
            <div style={{ color: license?.edition === 'ENTERPRISE' ? '#6ee7b7' : 'var(--text-secondary)', fontWeight: 750 }}>{license?.license?.status || 'missing'}</div>
          </div>
          {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
          {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="License ID" value={license?.installed?.licenseId || license?.license?.licenseId} />
            <Field label="Activation ID" value={license?.installed?.activationId} />
            <Field label="Instance ID" value={license?.installed?.instanceId || license?.license?.instanceId} />
            <Field label="Company" value={license?.license?.companyName} />
            <Field label="Customer email" value={license?.license?.customerEmail} />
            <Field label="Valid until" value={formatDate(license?.installed?.validUntil || license?.license?.validUntil)} />
            <Field label="Grace until" value={formatDate(license?.installed?.graceUntil || license?.license?.graceUntil)} />
            <Field label="Last checked" value={formatDate(license?.installed?.lastRefreshAt)} />
          </div>
        </section>

        <form onSubmit={submitActivate} style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 20, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Activate Enterprise</h2>
          <label style={{ display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
            Paste license key
            <input value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} placeholder="sally_live_…" autoComplete="off" style={{ padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }} />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" disabled={working} style={{ border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750 }}>Activate license</button>
            <button type="button" disabled={working || !license?.installed} onClick={handleRemove} style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: '10px 14px', fontWeight: 700 }}>Remove license</button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
