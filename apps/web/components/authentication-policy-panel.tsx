'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getAuthenticationPolicy, getEdition, saveAuthenticationPolicy } from '../lib/api'
import { hasFeature, type EditionInfo } from '../lib/edition'

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const labelStyle = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }

export function AuthenticationPolicyPanel() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [minimumPasswordLength, setMinimumPasswordLength] = useState('12')
  const [requirePasswordUppercase, setRequirePasswordUppercase] = useState(true)
  const [requirePasswordLowercase, setRequirePasswordLowercase] = useState(true)
  const [requirePasswordNumber, setRequirePasswordNumber] = useState(true)
  const [requirePasswordSymbol, setRequirePasswordSymbol] = useState(true)
  const [disablePasswordLoginForSso, setDisablePasswordLoginForSso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const enterprise = hasFeature(edition, 'security.sessionPolicy')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await getEdition()
      setEdition(info)
      if (!hasFeature(info, 'security.sessionPolicy')) return
      const result = await getAuthenticationPolicy()
      setMinimumPasswordLength(String(result.policy.minimumPasswordLength))
      setRequirePasswordUppercase(result.policy.requirePasswordUppercase)
      setRequirePasswordLowercase(result.policy.requirePasswordLowercase)
      setRequirePasswordNumber(result.policy.requirePasswordNumber)
      setRequirePasswordSymbol(result.policy.requirePasswordSymbol)
      setDisablePasswordLoginForSso(result.policy.disablePasswordLoginForSso)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load authentication policy')
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
      await saveAuthenticationPolicy({ minimumPasswordLength: Math.max(8, Math.min(128, Math.floor(Number(minimumPasswordLength || 12)))), requirePasswordUppercase, requirePasswordLowercase, requirePasswordNumber, requirePasswordSymbol, disablePasswordLoginForSso })
      setNotice('Authentication policy saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save authentication policy')
    } finally {
      setWorking(false)
    }
  }

  if (!loading && !enterprise) {
    return <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 8 }}><h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>Authentication policy</h3><p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Local email/password authentication uses Sally's default strong-password policy in Community. Enterprise unlocks configurable password and SSO password-login policy.</p></section>
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>Authentication policy</h3>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>Password strength and SSO password-login guardrails for new activations and password resets.</p>
      </div>
      {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
      {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label style={labelStyle}>Minimum password length<input inputMode="numeric" value={minimumPasswordLength} onChange={(event) => setMinimumPasswordLength(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={requirePasswordUppercase} onChange={(event) => setRequirePasswordUppercase(event.target.checked)} /> Require uppercase letters</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={requirePasswordLowercase} onChange={(event) => setRequirePasswordLowercase(event.target.checked)} /> Require lowercase letters</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={requirePasswordNumber} onChange={(event) => setRequirePasswordNumber(event.target.checked)} /> Require numbers</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={requirePasswordSymbol} onChange={(event) => setRequirePasswordSymbol(event.target.checked)} /> Require symbols</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={disablePasswordLoginForSso} onChange={(event) => setDisablePasswordLoginForSso(event.target.checked)} /> Disable password login for non-superadmins when SSO is enabled</label>
        <button type="submit" disabled={working || loading} style={{ justifySelf: 'start', border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Save authentication policy</button>
      </form>
    </section>
  )
}
