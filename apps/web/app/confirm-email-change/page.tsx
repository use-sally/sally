'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { confirmEmailChange } from '../../lib/api'

type Status = 'working' | 'done' | 'error'

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

  return <div style={{ width: 460, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{status === 'done' ? 'Email confirmed' : status === 'error' ? 'Confirmation failed' : 'Confirming email change'}</div><div style={{ marginTop: 10, color: status === 'error' ? '#991b1b' : '#475569', fontSize: 14 }}>{message}</div></div>
}

export default function ConfirmEmailChangePage() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}><Suspense fallback={<div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>}><ConfirmEmailChangeInner /></Suspense></div>
}
