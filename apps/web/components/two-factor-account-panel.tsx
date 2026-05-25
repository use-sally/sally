'use client'

import { FormEvent, useEffect, useState } from 'react'
import { confirmTwoFactorSetup, disableTwoFactor, getTwoFactorStatus, startTwoFactorSetup } from '../lib/api'

export function TwoFactorAccountPanel() {
  const [enabled, setEnabled] = useState(false)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const status = await getTwoFactorStatus()
      setEnabled(status.enabled)
      setConfirmedAt(status.confirmedAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load 2FA status')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const start = async () => {
    setWorking(true); setError(null); setMessage(null)
    try {
      const setup = await startTwoFactorSetup()
      setSecret(setup.secret)
      setOtpauthUrl(setup.otpauthUrl)
      setMessage('Add this secret to your authenticator app, then enter the current code.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to start 2FA setup') }
    finally { setWorking(false) }
  }

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true); setError(null); setMessage(null)
    try {
      const result = await confirmTwoFactorSetup({ code })
      setEnabled(result.enabled)
      setConfirmedAt(result.confirmedAt)
      setSecret(null); setOtpauthUrl(null); setCode('')
      setMessage('2FA enabled.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to confirm 2FA') }
    finally { setWorking(false) }
  }

  const disable = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true); setError(null); setMessage(null)
    try {
      await disableTwoFactor({ code: disableCode })
      setEnabled(false); setConfirmedAt(null); setDisableCode('')
      setMessage('2FA disabled.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to disable 2FA') }
    finally { setWorking(false) }
  }

  return (
    <div style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Two-factor authentication</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{loading ? 'Loading…' : enabled ? `Enabled${confirmedAt ? ` since ${new Date(confirmedAt).toLocaleString()}` : ''}.` : 'Not enabled.'}</div>
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {message ? <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{message}</div> : null}
      {!enabled && !secret ? <button type="button" disabled={working || loading} onClick={start} style={buttonStyle}>Set up authenticator app</button> : null}
      {secret ? <form onSubmit={confirm} style={{ display: 'grid', gap: 10 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Secret: <code style={{ color: 'var(--text-primary)' }}>{secret}</code></div>
        {otpauthUrl ? <a href={otpauthUrl} style={{ color: 'var(--task-title)', fontSize: 13 }}>Open authenticator app</a> : null}
        <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" placeholder="123456" style={inputStyle} />
        <button type="submit" disabled={working} style={buttonStyle}>Confirm and enable 2FA</button>
      </form> : null}
      {enabled ? <form onSubmit={disable} style={{ display: 'grid', gap: 10 }}>
        <input value={disableCode} onChange={(event) => setDisableCode(event.target.value)} inputMode="numeric" placeholder="2FA code to disable" style={inputStyle} />
        <button type="submit" disabled={working} style={{ ...buttonStyle, background: 'transparent', color: '#fecaca', borderColor: 'rgba(248,113,113,0.45)' }}>Disable 2FA</button>
      </form> : null}
    </div>
  )
}

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const buttonStyle = { justifySelf: 'start', border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750 }
