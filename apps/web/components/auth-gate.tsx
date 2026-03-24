'use client'

import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getMe, login, requestPasswordReset } from '../lib/api'
import { clearSession, getWorkspaceId, loadSession, saveSession, setWorkspaceId } from '../lib/auth'

type AuthMode = 'login' | 'forgot'

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [status, setStatus] = useState<'checking' | 'unauth' | 'authed' | 'no-access'>('checking')
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isPublicAuthRoute = pathname === '/reset-password' || pathname === '/accept-invite' || pathname === '/confirm-email-change'

  useEffect(() => {
    if (isPublicAuthRoute) return
    const existing = loadSession()
    if (!existing?.token) {
      setStatus('unauth')
      return
    }
    void refreshSession()
  }, [isPublicAuthRoute])

  const refreshSession = async () => {
    try {
      setError(null)
      const me = await getMe()
      const session = loadSession()
      const next = {
        token: session?.token || '',
        expiresAt: session?.expiresAt,
        account: me.account,
        memberships: me.memberships,
      }
      saveSession(next)
      const workspaceId = getWorkspaceId()
      if (!me.memberships.length) {
        setStatus('no-access')
        return
      }
      if (!workspaceId) setWorkspaceId(me.memberships[0].workspaceId)
      setStatus('authed')
    } catch (err) {
      clearSession()
      setStatus('unauth')
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (!password.trim()) {
      setError('Password is required.')
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const response = await login({ email: email.trim(), password: password.trim() })
      saveSession({
        token: response.sessionToken,
        expiresAt: response.expiresAt,
        account: response.account,
        memberships: response.memberships,
      })
      if (!response.memberships.length) {
        setStatus('no-access')
        return
      }
      setWorkspaceId(response.memberships[0].workspaceId)
      setStatus('authed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      clearSession()
    } finally {
      setLoading(false)
    }
  }

  const handleRequestReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const response = await requestPasswordReset({ email: email.trim() })
      const expiry = response.expiresAt ? ` It expires at ${new Date(response.expiresAt).toLocaleString()}.` : ''
      setInfo(`If that account exists, a reset link has been sent to the inbox.${expiry}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRetryAccess = async () => {
    setStatus('checking')
    await refreshSession()
  }

  const handleSignOut = () => {
    clearSession()
    setStatus('unauth')
  }

  if (isPublicAuthRoute) {
    return <>{children}</>
  }

  if (status === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
        <div style={{ padding: 24, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>Checking session…</div>
      </div>
    )
  }

  if (status === 'unauth') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
        {mode === 'login' ? (
          <form onSubmit={handleSubmit} style={{ width: 360, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Sign in</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>Use your account email to access the workspace.</div>
            <label style={{ display: 'grid', gap: 6, marginTop: 18 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Password</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
            </label>
            {error ? <div style={{ marginTop: 12, color: '#991b1b', fontSize: 13 }}>{error}</div> : null}
            {info ? <div style={{ marginTop: 12, color: '#0f172a', fontSize: 13 }}>{info}</div> : null}
            <button type="submit" disabled={loading} style={{ marginTop: 18, width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', fontWeight: 700, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
              {loading ? 'Signing in…' : 'Continue'}
            </button>
            <button type="button" onClick={() => { setMode('forgot'); setError(null); setInfo(null) }} style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 700, background: '#fff', color: '#0f172a', cursor: 'pointer' }}>
              Forgot password?
            </button>
          </form>
        ) : null}
        {mode === 'forgot' ? (
          <form onSubmit={handleRequestReset} style={{ width: 380, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Reset your password</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>Enter your account email to get a reset token.</div>
            <label style={{ display: 'grid', gap: 6, marginTop: 18 }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" style={inputStyle} />
            </label>
            {error ? <div style={{ marginTop: 12, color: '#991b1b', fontSize: 13 }}>{error}</div> : null}
            {info ? <div style={{ marginTop: 12, color: '#0f172a', fontSize: 13 }}>{info}</div> : null}
            <button type="submit" disabled={loading} style={{ marginTop: 18, width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', fontWeight: 700, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
              {loading ? 'Requesting…' : 'Request reset'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(null); setInfo(null) }} style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 700, background: '#fff', color: '#0f172a', cursor: 'pointer' }}>
              Back to sign in
            </button>
          </form>
        ) : null}
      </div>
    )
  }

  if (status === 'no-access') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
        <div style={{ width: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)', display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Workspace access needed</div>
          <div style={{ color: '#64748b', fontSize: 14 }}>Your account exists, but it does not have access to a workspace yet. Ask an admin to grant access, then retry.</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleRetryAccess} style={{ padding: '11px 14px', borderRadius: 12, border: 'none', fontWeight: 700, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>Retry</button>
            <button onClick={handleSignOut} style={{ padding: '11px 14px', borderRadius: 12, border: '1px solid #dbe1ea', fontWeight: 700, background: '#fff', color: '#0f172a', cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

const inputStyle: CSSProperties = {
  padding: '11px 12px',
  borderRadius: 12,
  border: '1px solid #dbe1ea',
  fontSize: 14,
}
