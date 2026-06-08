'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getEdition, getSessionPolicy, revokeActiveSessions, saveSessionPolicy } from '../lib/api'
import { hasFeature, type EditionInfo } from '../lib/edition'
import { EnterpriseLockedCard } from './enterprise-locked-card'

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const labelStyle = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }

export function SessionPolicyPanel() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [maxSessionLifetimeDays, setMaxSessionLifetimeDays] = useState('30')
  const [revokeOnPolicyChange, setRevokeOnPolicyChange] = useState(false)
  const [restrictSessionPolicyToAdmins, setRestrictSessionPolicyToAdmins] = useState(true)
  const [activeSessions, setActiveSessions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const enabled = hasFeature(edition, 'security.sessionPolicy')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await getEdition()
      setEdition(info)
      if (!hasFeature(info, 'security.sessionPolicy')) return
      const result = await getSessionPolicy()
      setMaxSessionLifetimeDays(String(result.policy.maxSessionLifetimeDays))
      setRevokeOnPolicyChange(result.policy.revokeOnPolicyChange)
      setRestrictSessionPolicyToAdmins(result.policy.restrictSessionPolicyToAdmins)
      setActiveSessions(result.activeSessions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session policy')
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
      const result = await saveSessionPolicy({ maxSessionLifetimeDays: Math.max(1, Math.min(365, Math.floor(Number(maxSessionLifetimeDays || 30)))), revokeOnPolicyChange, restrictSessionPolicyToAdmins })
      setNotice(result.revokedSessions ? `Session policy saved. Revoked ${result.revokedSessions} active session${result.revokedSessions === 1 ? '' : 's'}.` : 'Session policy saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save session policy')
    } finally {
      setWorking(false)
    }
  }

  const revokeSessions = async () => {
    if (!window.confirm('Revoke all other active sessions? Your current session stays active.')) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const result = await revokeActiveSessions()
      setNotice(`Revoked ${result.revokedSessions} active session${result.revokedSessions === 1 ? '' : 's'}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke sessions')
    } finally {
      setWorking(false)
    }
  }

  if (!loading && !enabled) {
    return (
      <EnterpriseLockedCard title="Sessions" description="Set maximum session lifetimes and revoke active sessions centrally.">
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>Visible in Community; editable in Enterprise.</div>
      </EnterpriseLockedCard>
    )
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 'var(--font-16)' }}>Sessions</h3>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.55 }}>Enterprise session lifetime and force-logout controls. New sessions use the configured lifetime.</p>
      </div>
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', padding: 12, color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>Active sessions: <strong style={{ color: 'var(--text-primary)' }}>{activeSessions}</strong></div>
      {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
      {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label style={labelStyle}>Maximum session lifetime days<input inputMode="numeric" value={maxSessionLifetimeDays} onChange={(event) => setMaxSessionLifetimeDays(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={revokeOnPolicyChange} onChange={(event) => setRevokeOnPolicyChange(event.target.checked)} /> Revoke other active sessions when this policy changes</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={restrictSessionPolicyToAdmins} onChange={(event) => setRestrictSessionPolicyToAdmins(event.target.checked)} /> Restrict session policy management to platform admins</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" disabled={working || loading} style={{ border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Save session policy</button>
          <button type="button" disabled={working || loading} onClick={revokeSessions} style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'transparent', color: '#fecaca', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Revoke active sessions</button>
        </div>
      </form>
    </section>
  )
}
