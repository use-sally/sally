'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { acceptInvite } from '../../lib/api'
import { saveSession, setWorkspaceId } from '../../lib/auth'

function AcceptInviteForm() {
  const params = useSearchParams()
  const router = useRouter()
  const initialToken = useMemo(() => params.get('token') ?? '', [params])
  const [token, setToken] = useState(initialToken)
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
      saveSession({
        token: response.sessionToken,
        expiresAt: response.expiresAt,
        account: response.account,
        memberships: response.memberships,
      })
      if (response.memberships.length) {
        setWorkspaceId(response.memberships[0].workspaceId)
      }
      setInfo('Invite accepted. Redirecting to workspace...')
      setTimeout(() => router.push('/'), 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: 440, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Accept your invite</div>
      <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>Set your name and password to join the workspace.</div>
      <label style={{ display: 'grid', gap: 6, marginTop: 18 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Invite token</span>
        <input value={token} onChange={(event) => setToken(event.target.value)} type="text" placeholder="token" style={inputStyle} />
      </label>
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} type="text" placeholder="Optional" style={inputStyle} />
      </label>
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Password</span>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      <div style={{ color: '#64748b', fontSize: 13 }}>Use at least 12 characters with uppercase, lowercase, number, and symbol.</div>
      <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Confirm password</span>
        <input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" placeholder="••••••••" style={inputStyle} />
      </label>
      {error ? <div style={{ marginTop: 12, color: '#991b1b', fontSize: 13 }}>{error}</div> : null}
      {info ? <div style={{ marginTop: 12, color: '#0f172a', fontSize: 13 }}>{info}</div> : null}
      <button type="submit" disabled={loading} style={{ marginTop: 18, width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', fontWeight: 700, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>
        {loading ? 'Accepting…' : 'Accept invite'}
      </button>
    </form>
  )
}

export default function AcceptInvitePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <Suspense fallback={<div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>}>
        <AcceptInviteForm />
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
