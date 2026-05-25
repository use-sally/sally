'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getEdition, getTwoFactorPolicy, saveTwoFactorPolicy } from '../lib/api'
import { hasFeature, type EditionInfo } from '../lib/edition'
import { EnterpriseLockedCard } from './enterprise-locked-card'

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const labelStyle = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }

export function TwoFactorPolicyPanel() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [enforcementTarget, setEnforcementTarget] = useState('NONE')
  const [gracePeriodDays, setGracePeriodDays] = useState('14')
  const [allowRecoveryResetByAdmins, setAllowRecoveryResetByAdmins] = useState(true)
  const [enforcementReady, setEnforcementReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const enabled = hasFeature(edition, 'security.enforced2fa')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await getEdition()
      setEdition(info)
      if (!hasFeature(info, 'security.enforced2fa')) return
      const result = await getTwoFactorPolicy()
      setEnforcementTarget(result.policy.enforcementTarget)
      setGracePeriodDays(String(result.policy.gracePeriodDays))
      setAllowRecoveryResetByAdmins(result.policy.allowRecoveryResetByAdmins)
      setEnforcementReady(result.enforcementReady)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load 2FA policy')
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
      const result = await saveTwoFactorPolicy({ enforcementTarget, gracePeriodDays: Math.max(0, Math.min(90, Math.floor(Number(gracePeriodDays || 14)))), allowRecoveryResetByAdmins })
      setEnforcementReady(result.enforcementReady)
      setNotice(result.enforcementReady ? '2FA enforcement policy saved.' : '2FA policy saved. Enforcement will activate when user 2FA enrollment is available.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save 2FA policy')
    } finally {
      setWorking(false)
    }
  }

  if (!loading && !enabled) {
    return (
      <EnterpriseLockedCard title="2FA enforcement" description="Require 2FA for admins or all users, set grace periods, and reset recovery paths.">
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Visible in Community; editable in Enterprise.</div>
      </EnterpriseLockedCard>
    )
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>2FA enforcement</h3>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>Enterprise policy scaffold for requiring 2FA by role. Enrollment enforcement stays inactive until user 2FA setup is available.</p>
      </div>
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', padding: 12, color: enforcementReady ? '#bbf7d0' : 'var(--text-secondary)', fontSize: 13 }}>
        Enforcement status: <strong>{enforcementReady ? 'ready' : 'policy-only'}</strong>
      </div>
      {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
      {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label style={labelStyle}>Require 2FA for
          <select value={enforcementTarget} onChange={(event) => setEnforcementTarget(event.target.value)} style={inputStyle}>
            <option value="NONE">No one yet</option>
            <option value="ADMINS">Platform admins</option>
            <option value="ALL">All users</option>
          </select>
        </label>
        <label style={labelStyle}>Grace period days<input inputMode="numeric" value={gracePeriodDays} onChange={(event) => setGracePeriodDays(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={allowRecoveryResetByAdmins} onChange={(event) => setAllowRecoveryResetByAdmins(event.target.checked)} /> Allow platform admins to reset 2FA recovery</label>
        <button type="submit" disabled={working || loading} style={{ justifySelf: 'start', border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Save 2FA policy</button>
      </form>
    </section>
  )
}
