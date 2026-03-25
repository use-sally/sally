'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { confirmEmailChange } from '../../lib/api'

type Status = 'working' | 'done' | 'error'

const monoFont = `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: `radial-gradient(circle at 20% 0%, rgba(16,185,129,0.12), transparent 28%), radial-gradient(circle at 100% 0%, rgba(250,204,21,0.06), transparent 20%), linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px), var(--page-bg)`,
  backgroundSize: 'auto, auto, 32px 32px, 32px 32px, auto',
  color: '#d1fae5',
  fontFamily: monoFont,
  padding: 24,
}
const cardStyle: React.CSSProperties = {
  width: 460,
  background: 'rgba(3, 7, 18, 0.94)',
  border: '1px solid rgba(16, 185, 129, 0.14)',
  borderRadius: 20,
  padding: 24,
  boxShadow: '0 0 0 1px rgba(16,185,129,0.04), 0 20px 60px rgba(0,0,0,0.35)',
}

function ConfirmEmailChangeInner() {
  const params = useSearchParams()
  const token = useMemo(() => params.get('token') ?? '', [params])
  const [status, setStatus] = useState<Status>('working')
  const [message, setMessage] = useState('Confirming your email change…')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        setStatus('error')
        setMessage('Email change token is missing.')
        return
      }
      try {
        const response = await confirmEmailChange({ token })
        if (cancelled) return
        setStatus('done')
        setMessage(`Email updated to ${response.account.email}. You can return to the app now.`)
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Email confirmation failed')
      }
    }
    void run()
    return () => { cancelled = true }
  }, [token])

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>sally<span style={{ color: '#34d399' }}>_</span></div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcd34d' }}>auth / email</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, color: 'var(--text-primary)' }}>
        {status === 'done' ? 'Email confirmed' : status === 'error' ? 'Confirmation failed' : 'Confirming email change'}
      </div>
      <div style={{ marginTop: 10, color: status === 'error' ? '#fca5a5' : 'rgba(209, 250, 229, 0.68)', fontSize: 14, lineHeight: 1.6 }}>{message}</div>
    </div>
  )
}

export default function ConfirmEmailChangePage() {
  return (
    <div style={pageStyle}>
      <Suspense fallback={<div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</div>}>
        <ConfirmEmailChangeInner />
      </Suspense>
    </div>
  )
}
