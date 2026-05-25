'use client'

import { useEffect, useState } from 'react'
import { pickPreferredWorkspaceId, saveSession, setWorkspaceId } from '../../../lib/auth'

type SamlSessionPayload = {
  ok?: boolean
  sessionToken?: string
  expiresAt?: string
  account?: { id: string; name: string | null; email: string; avatarUrl?: string | null; platformRole?: 'NONE' | 'ADMIN' | 'SUPERADMIN' }
  memberships?: { id: string; workspaceId: string; workspaceSlug?: string; workspaceName: string; workspaceArchivedAt?: string | null; role: string }[]
}

export default function SamlCallbackPage() {
  const [message, setMessage] = useState('Completing SAML sign-in…')

  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('session')
      if (!raw) throw new Error('Missing SAML session payload')
      const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4)
      const payload = JSON.parse(decodeURIComponent(escape(window.atob(padded)))) as SamlSessionPayload
      if (!payload.sessionToken || !payload.account || !payload.memberships) throw new Error('Invalid SAML session payload')
      saveSession({ token: payload.sessionToken, expiresAt: payload.expiresAt, account: payload.account, memberships: payload.memberships })
      setWorkspaceId(pickPreferredWorkspaceId(payload.memberships))
      window.location.replace('/')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'SAML sign-in failed')
    }
  }, [])

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--page-bg)', color: 'var(--text-primary)', fontFamily: `'JetBrains Mono', monospace`, padding: 24 }}>
      <section style={{ width: 420, border: '1px solid var(--panel-border)', borderRadius: 20, background: 'var(--panel-bg)', padding: 24, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcd34d' }}>auth / sso</div>
        <h1 style={{ margin: 0, fontSize: 20 }}>SAML sign-in</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{message}</p>
      </section>
    </main>
  )
}
