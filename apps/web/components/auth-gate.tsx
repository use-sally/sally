'use client'

import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { getMe, login, requestPasswordReset } from '../lib/api'
import { clearSession, getWorkspaceId, loadSession, saveSession, setWorkspaceId, type Membership } from '../lib/auth'
import { projectInputField } from '../lib/theme'

type AuthMode = 'login' | 'forgot'

const monoFont = `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`

const authPage: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: `
    radial-gradient(circle at 20% 0%, rgba(16,185,129,0.12), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(250,204,21,0.06), transparent 20%),
    linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px),
    var(--page-bg)
  `,
  backgroundSize: 'auto, auto, 32px 32px, 32px 32px, auto',
  color: 'var(--text-primary)',
  fontFamily: monoFont,
  padding: 24,
}

const authCard: CSSProperties = {
  width: 400,
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-border)',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 0 0 1px rgba(16,185,129,0.04), 0 20px 60px rgba(0,0,0,0.35)',
}

const inputStyle: CSSProperties = { ...projectInputField, padding: '11px 12px', color: 'var(--text-primary)', fontFamily: monoFont, outline: 'none' }

const primaryButton: CSSProperties = {
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

const secondaryButton: CSSProperties = {
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

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'checking' | 'unauth' | 'authed' | 'no-access'>('checking')
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isPublicAuthRoute = pathname === '/reset-password' || pathname === '/accept-invite' || pathname === '/confirm-email-change'

  const requestedWorkspaceId = searchParams.get('workspaceId')

  function pickWorkspaceId(memberships: Membership[]) {
    if (requestedWorkspaceId && memberships.some((membership) => membership.workspaceId === requestedWorkspaceId)) return requestedWorkspaceId
    const storedWorkspaceId = getWorkspaceId()
    if (storedWorkspaceId && memberships.some((membership) => membership.workspaceId === storedWorkspaceId)) return storedWorkspaceId
    return memberships[0]?.workspaceId || null
  }

  useEffect(() => {
    if (isPublicAuthRoute) return
    const existing = loadSession()
    if (!existing?.token) {
      setStatus('unauth')
      return
    }
    void refreshSession()
  }, [isPublicAuthRoute, requestedWorkspaceId])

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
      if (!me.memberships.length) {
        setStatus('no-access')
        return
      }
      setWorkspaceId(pickWorkspaceId(me.memberships))
      setStatus('authed')
    } catch {
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
      setWorkspaceId(pickWorkspaceId(response.memberships))
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
      <div style={authPage}>
        <div style={{ ...authCard, width: 320, textAlign: 'center' as const }}>Checking session…</div>
      </div>
    )
  }

  if (status === 'unauth') {
    return (
      <div style={authPage}>
        {mode === 'login' ? (
          <form onSubmit={handleSubmit} style={authCard}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>sally<span style={{ color: '#34d399' }}>_</span></div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcd34d' }}>auth / login</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, color: 'var(--text-primary)' }}>Sign in</div>
            <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>Use your account email to access the workspace.</div>
            <label style={{ display: 'grid', gap: 6, marginTop: 18 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Password</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
            </label>
            {error ? <div style={{ marginTop: 12, color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
            {info ? <div style={{ marginTop: 12, color: '#fde68a', fontSize: 13 }}>{info}</div> : null}
            <button type="submit" disabled={loading} style={primaryButton}>
              {loading ? 'Signing in…' : 'Continue'}
            </button>
            <button type="button" onClick={() => { setMode('forgot'); setError(null); setInfo(null) }} style={secondaryButton}>
              Forgot password?
            </button>
          </form>
        ) : null}
        {mode === 'forgot' ? (
          <form onSubmit={handleRequestReset} style={{ ...authCard, width: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>sally<span style={{ color: '#34d399' }}>_</span></div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcd34d' }}>auth / recovery</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, color: 'var(--text-primary)' }}>Reset your password</div>
            <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>Enter your account email to get a reset link.</div>
            <label style={{ display: 'grid', gap: 6, marginTop: 18 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@company.com" style={inputStyle} />
            </label>
            {error ? <div style={{ marginTop: 12, color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
            {info ? <div style={{ marginTop: 12, color: '#fde68a', fontSize: 13 }}>{info}</div> : null}
            <button type="submit" disabled={loading} style={primaryButton}>
              {loading ? 'Requesting…' : 'Request reset'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(null); setInfo(null) }} style={secondaryButton}>
              Back to sign in
            </button>
          </form>
        ) : null}
      </div>
    )
  }

  if (status === 'no-access') {
    return (
      <div style={authPage}>
        <div style={{ ...authCard, width: 440, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>sally<span style={{ color: '#34d399' }}>_</span></div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcd34d' }}>auth / access</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Workspace access needed</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>Your account exists, but it does not have access to a workspace yet. Ask an admin to grant access, then retry.</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleRetryAccess} style={{ ...primaryButton, marginTop: 0, width: 'auto' }}>Retry</button>
            <button onClick={handleSignOut} style={{ ...secondaryButton, marginTop: 0, width: 'auto' }}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
