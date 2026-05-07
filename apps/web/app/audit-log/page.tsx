'use client'

import { useEffect, useState } from 'react'
import type { AuditLogEvent } from '@sally/types/src'
import { AppShell } from '../../components/app-shell'
import { getAuditLog } from '../../lib/api'

function formatDate(value: string) {
  try { return new Date(value).toLocaleString() } catch { return value }
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditLogEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAuditLog({ limit: 100 })
      .then((items) => { if (!cancelled) setEvents(items) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit log') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <AppShell title="Audit Log" subtitle="Governance record of sensitive admin, workspace, and automation actions.">
      <section style={{ display: 'grid', gap: 16 }}>
        <div style={{ border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', borderRadius: 18, padding: 18 }}>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Audit Log</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>Latest platform-level security and automation events.</div>
        </div>
        {error ? <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div> : null}
        {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading audit events…</div> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {events.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No audit events yet.</div> : null}
            {events.map((event) => (
              <div key={event.id} style={{ border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{event.action}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(event.createdAt)}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{event.summary || 'No summary'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>actor: {event.actor?.email || 'system'}</span>
                  <span>target: {event.targetType || '—'} {event.targetId || ''}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
