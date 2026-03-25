'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resetPassword } from '../../lib/api'
import { saveSession, setWorkspaceId } from '../../lib/auth'

type Status = 'idle' | 'saving' | 'done'

const monoFont = `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: `radial-gradient(circle at 20% 0%, rgba(16,185,129,0.12), transparent 28%), radial-gradient(circle at 100% 0%, rgba(250,204,21,0.06), transparent 20%), linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px), var(--page-bg)`,
  backgroundSize: 'auto, auto, 32px 32px, 32px 32px, auto',
  color: 'var(--text-primary)',
  fontFamily: monoFont,
  padding: 24,
}
const cardStyle: React.CSSProperties = {
  width: 420,
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-border)',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 0 0 1px rgba(16,185,129,0.04), 0 20px 60px rgba(0,0,0,0.35)',
}
const inputStyle: React.CSSProperties = {
  padding: '11px 12px',
  borderRadius: 12,
  border: '1px solid var(--form-border)',
  fontSize: 14,
  background: 'var(--form-bg)',
  color: 'var(--text-primary)',
  fontFamily: monoFont,
}
const primaryButton: React.CSSProperties = {
  marginTop: 18,
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(250, 204, 21, 0.35)',
  fontWeight: 700,
  background: 'rgba(250, 204, 21, 0.14)',
  color: '#fde68a',
  cursor: 'pointer',
  fontFamily: monoFont,
}
const secondaryButton: React.CSSProperties = {
  marginTop: 10,
  width: '100%',
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid var(--panel-border)',
  fontWeight: 700,
  background: 'var(--panel-bg)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: monoFont,
}

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = useMemo(() => params.get('token') ?? '', [params])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token.trim()) {
      setError('Reset token is required.')
      return
    }
    if (!password.trim()) {
      setError('New password is required.')
      return
    }
    if (password.trim() !== confirm.trim()) {
      setError('Passwords do not match.')
      return
    }
    setStatus('saving')
    setError(null)
    setInfo(null)
    try {
      const response = await resetPassword({ token: token.trim(), password: password.trim() })
      saveSession({ token: response.sessionToken, expiresAt: response.expiresAt, account: response.account, memberships: response.memberships })
      if (response.memberships[0]?.workspaceId) setWorkspaceId(response.memberships[0].workspaceId)
      setStatus('done')
      setInfo('Password updated. Redirecting…')
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed')
      setStatus('idle')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>sally<span style={{ color: '#34d399' }}>_</span></div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcd34d' }}>auth / password</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, color: 'var(--text-primary)' }}>Reset your password</div>
      <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>Choose a new password for your account.</div>
      <label style={{ display: 'grid', gap: 6, marginTop: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>New password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>Use at least 12 characters with uppercase, lowercase, number, and symbol.</div>
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Confirm password</span>
        <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      {error ? <div style={{ marginTop: 12, color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {info ? <div style={{ marginTop: 12, color: '#fde68a', fontSize: 13 }}>{info}</div> : null}
      <button type="submit" disabled={status === 'saving'} style={primaryButton}>
        {status === 'saving' ? 'Updating…' : 'Update password'}
      </button>
      <button type="button" onClick={() => router.push('/')} style={secondaryButton}>
        Back to sign in
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={pageStyle}>
      <Suspense fallback={<div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
