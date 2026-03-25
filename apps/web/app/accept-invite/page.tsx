'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { acceptInvite } from '../../lib/api'
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

function AcceptInviteForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = useMemo(() => params.get('token') ?? '', [params])
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token.trim()) {
      setError('Invite token is required.')
      return
    }
    if (!password.trim()) {
      setError('Password is required.')
      return
    }
    if (password.trim() !== confirm.trim()) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const response = await acceptInvite({ token: token.trim(), name: name.trim() || undefined, password: password.trim() })
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
      <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>Set your name and password to join the workspace.</div>
      {!token ? <div style={{ marginTop: 18, color: 'var(--danger-text)', fontSize: 13 }}>Invite token is missing from this link.</div> : null}
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} type="text" placeholder="Optional" style={inputStyle} />
      </label>
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>Use at least 12 characters with uppercase, lowercase, number, and symbol.</div>
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#fcd34d' }}>Confirm password</span>
        <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      {error ? <div style={{ marginTop: 12, color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
      {info ? <div style={{ marginTop: 12, color: '#fde68a', fontSize: 13 }}>{info}</div> : null}
      <button type="submit" disabled={loading} style={primaryButton}>
        {loading ? 'Accepting…' : 'Accept invite'}
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
