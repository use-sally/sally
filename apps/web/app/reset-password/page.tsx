'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resetPassword } from '../../lib/api'
import { saveSession, setWorkspaceId } from '../../lib/auth'

type Status = 'idle' | 'saving' | 'done'

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
      saveSession({
        token: response.sessionToken,
        expiresAt: response.expiresAt,
        account: response.account,
        memberships: response.memberships,
      })
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
    <form onSubmit={handleSubmit} style={{ width: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Reset your password</div>
      <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>Choose a new password for your account.</div>
      <label style={{ display: 'grid', gap: 6, marginTop: 18 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>New password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      <div style={{ color: '#64748b', fontSize: 13 }}>Use at least 12 characters with uppercase, lowercase, number, and symbol.</div>
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Confirm password</span>
        <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      {error ? <div style={{ marginTop: 12, color: '#991b1b', fontSize: 13 }}>{error}</div> : null}
      {info ? <div style={{ marginTop: 12, color: '#0f172a', fontSize: 13 }}>{info}</div> : null}
      <button type="submit" disabled={status === 'saving'} style={{ marginTop: 18, width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', fontWeight: 700, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
        {status === 'saving' ? 'Updating…' : 'Update password'}
      </button>
      <button type="button" onClick={() => router.push('/')} style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 700, background: '#fff', color: '#0f172a', cursor: 'pointer' }}>
        Back to sign in
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <Suspense fallback={<div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 12px',
  borderRadius: 12,
  border: '1px solid #dbe1ea',
  fontSize: 14,
}
