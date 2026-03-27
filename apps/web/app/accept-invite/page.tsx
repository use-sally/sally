'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { acceptInvite, getInviteInfo, requestPasswordReset } from '../../lib/api'
import { projectInputField } from '../../lib/theme'
import { saveSession, setWorkspaceId } from '../../lib/auth'

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
  width: 440,
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-border)',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 0 0 1px rgba(16,185,129,0.04), 0 20px 60px rgba(0,0,0,0.35)',
}
const inputStyle: React.CSSProperties = { ...projectInputField, padding: '11px 12px', color: 'var(--text-primary)', fontFamily: monoFont }
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
const inlineLinkButton: React.CSSProperties = {
  marginTop: 8,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: '#fde68a',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: monoFont,
}

function readInviteTokenFromLocation() {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  return url.searchParams.get('token')?.trim() ?? ''
}

function AcceptInviteForm() {
  const params = useSearchParams()
  const router = useRouter()
  const tokenFromParams = useMemo(() => params.get('token')?.trim() ?? '', [params])
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteInfo, setInviteInfo] = useState<null | { email: string; workspaceId: string; role: string; expiresAt: string; accountExists: boolean; accountActivated: boolean }>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    const nextToken = tokenFromParams || readInviteTokenFromLocation()
    if (nextToken) setToken(nextToken)
  }, [tokenFromParams])

  useEffect(() => {
    const activeToken = token || tokenFromParams || readInviteTokenFromLocation()
    if (!activeToken) return
    let cancelled = false
    void getInviteInfo(activeToken)
      .then((response) => {
        if (!cancelled) setInviteInfo(response.invite)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load invite')
      })
    return () => { cancelled = true }
  }, [token, tokenFromParams])

  const handlePasswordReset = async () => {
    if (!inviteInfo?.email || resetting) return
    setResetting(true)
    setError(null)
    setInfo(null)
    try {
      await requestPasswordReset({ email: inviteInfo.email, inviteToken: token || tokenFromParams || readInviteTokenFromLocation() })
      setInfo(`Password reset sent to ${inviteInfo.email}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send password reset')
    } finally {
      setResetting(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const activeToken = token || tokenFromParams || readInviteTokenFromLocation()
    if (!activeToken.trim()) {
      setError('Invite token is required.')
      return
    }
    if (!password.trim()) {
      setError('Password is required.')
      return
    }
    if (!inviteInfo?.accountActivated && password.trim() !== confirm.trim()) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const response = await acceptInvite({ token: activeToken.trim(), name: name.trim() || undefined, password: password.trim() })
      saveSession({ token: response.sessionToken, expiresAt: response.expiresAt, account: response.account, memberships: response.memberships })
      if (response.memberships.length) setWorkspaceId(response.memberships[0].workspaceId)
      setInfo('Invite accepted. Redirecting to workspace...')
      setTimeout(() => router.push('/'), 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>sally<span style={{ color: '#34d399' }}>_</span></div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcd34d' }}>auth / invite</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, color: 'var(--text-primary)' }}>Accept your invite</div>
      <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
        {inviteInfo?.accountActivated
          ? 'This email already has an account. Enter your existing password to join this workspace.'
          : 'Set your name and password to join the workspace.'}
      </div>
      {!(token || tokenFromParams) ? <div style={{ marginTop: 18, color: 'var(--danger-text)', fontSize: 13 }}>Invite token is missing from this link.</div> : null}
      {!inviteInfo?.accountActivated ? (
        <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} type="text" placeholder="Optional" style={inputStyle} />
        </label>
      ) : null}
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      {!inviteInfo?.accountActivated ? <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>Use at least 12 characters with uppercase, lowercase, number, and symbol.</div> : null}
      {!inviteInfo?.accountActivated ? (
        <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Confirm password</span>
          <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
        </label>
      ) : null}
      {error ? (
        <div style={{ marginTop: 12, color: 'var(--danger-text)', fontSize: 13 }}>
          <div>{error}</div>
          {inviteInfo?.accountActivated && error.includes('reset it first') ? (
            <button type="button" onClick={() => void handlePasswordReset()} disabled={resetting} style={inlineLinkButton}>
              {resetting ? 'Sending reset…' : `Send password reset to ${inviteInfo.email}`}
            </button>
          ) : null}
        </div>
      ) : null}
      {info ? <div style={{ marginTop: 12, color: '#fde68a', fontSize: 13 }}>{info}</div> : null}
      <button type="submit" disabled={loading} style={primaryButton}>
        {loading ? 'Accepting…' : inviteInfo?.accountActivated ? 'Join workspace' : 'Accept invite'}
      </button>
    </form>
  )
}

export default function AcceptInvitePage() {
  return (
    <div style={pageStyle}>
      <Suspense fallback={<div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</div>}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  )
}
