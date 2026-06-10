'use client'

import Image from 'next/image'
import { FormEvent, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { startRegistration } from '@simplewebauthn/browser'
import { confirmTwoFactorSetup, deletePasskey, disableTwoFactor, getTwoFactorStatus, startPasskeyRegistration, startTwoFactorSetup, verifyPasskeyRegistration, type PasskeySummary } from '../lib/api'

export function TwoFactorAccountPanel() {
  const [enabled, setEnabled] = useState(false)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([])
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
      setPasskeys(status.passkeys ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load 2FA status')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!otpauthUrl) {
      setQrCodeDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(otpauthUrl, { margin: 1, width: 192, color: { dark: '#052e16', light: '#ffffff' } })
      .then((dataUrl) => { if (!cancelled) setQrCodeDataUrl(dataUrl) })
      .catch(() => { if (!cancelled) setQrCodeDataUrl(null) })
    return () => { cancelled = true }
  }, [otpauthUrl])

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
      setSecret(null); setOtpauthUrl(null); setQrCodeDataUrl(null); setCode('')
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

  const addPasskey = async () => {
    setWorking(true); setError(null); setMessage(null)
    try {
      const setup = await startPasskeyRegistration()
      const response = await startRegistration({ optionsJSON: setup.options })
      const result = await verifyPasskeyRegistration({ token: setup.token, response, label: 'Passkey' })
      setPasskeys((items) => [result.passkey, ...items])
      setMessage('Passkey added. You can use it as your second factor at login.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to add passkey') }
    finally { setWorking(false) }
  }

  const removePasskey = async (passkeyId: string) => {
    setWorking(true); setError(null); setMessage(null)
    try {
      await deletePasskey(passkeyId)
      setPasskeys((items) => items.filter((item) => item.id !== passkeyId))
      setMessage('Passkey removed.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to remove passkey') }
    finally { setWorking(false) }
  }

  return (
    <div style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Two-factor authentication</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>{loading ? 'Loading…' : enabled ? `Enabled${confirmedAt ? ` since ${new Date(confirmedAt).toLocaleString()}` : ''}.` : 'Not enabled.'}</div>
      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{error}</div> : null}
      {message ? <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-13)' }}>{message}</div> : null}
      {!enabled && !secret ? <button type="button" disabled={working || loading} onClick={start} style={buttonStyle}>Set up authenticator app</button> : null}
      {secret ? <form onSubmit={confirm} style={{ display: 'grid', gap: 10 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>Scan this QR code with your authenticator app, or enter the setup key manually.</div>
        {qrCodeDataUrl ? <Image src={qrCodeDataUrl} alt="QR code for authenticator app setup" width={192} height={192} unoptimized style={{ borderRadius: 12, border: '1px solid var(--panel-border)', background: '#fff', padding: 10 }} /> : <div style={{ width: 192, height: 192, borderRadius: 12, border: '1px solid var(--panel-border)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-12)' }}>Generating QR…</div>}
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>Setup key: <code style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{secret}</code></div>
        {otpauthUrl ? <a href={otpauthUrl} style={{ color: 'var(--task-title)', fontSize: 'var(--font-13)' }}>Open authenticator app</a> : null}
        <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" placeholder="123456" style={inputStyle} />
        <button type="submit" disabled={working} style={buttonStyle}>Confirm and enable 2FA</button>
      </form> : null}
      <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: 12, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Passkeys</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>Use a passkey, Face ID, Touch ID, or Windows Hello as a phishing-resistant second factor.</div>
        <button type="button" disabled={working || loading} onClick={() => void addPasskey()} style={buttonStyle}>Add passkey</button>
        {passkeys.length ? <div style={{ display: 'grid', gap: 8 }}>{passkeys.map((passkey) => <div key={passkey.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', border: '1px solid var(--panel-border)', borderRadius: 12, padding: '9px 10px' }}><span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>{passkey.label || 'Passkey'} · added {new Date(passkey.createdAt).toLocaleDateString()}</span><button type="button" disabled={working} onClick={() => void removePasskey(passkey.id)} style={{ ...buttonStyle, background: 'transparent', color: '#fecaca', borderColor: 'rgba(248,113,113,0.45)' }}>Remove</button></div>)}</div> : <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>No passkeys yet.</div>}
      </div>
      {enabled ? <form onSubmit={disable} style={{ display: 'grid', gap: 10 }}>
        <input value={disableCode} onChange={(event) => setDisableCode(event.target.value)} inputMode="numeric" placeholder="2FA code to disable" style={inputStyle} />
        <button type="submit" disabled={working} style={{ ...buttonStyle, background: 'transparent', color: '#fecaca', borderColor: 'rgba(248,113,113,0.45)' }}>Disable 2FA</button>
      </form> : null}
    </div>
  )
}

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const buttonStyle = { justifySelf: 'start', border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750 }
