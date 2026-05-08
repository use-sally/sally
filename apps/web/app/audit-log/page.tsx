'use client'

import { useEffect, useState } from 'react'
import type { AuditLogEvent, EditionInfo } from '@sally/types/src'
import { AppShell } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { getAuditLog, getEdition } from '../../lib/api'
import { hasFeature } from '../../lib/edition'

function formatDate(value: string) {
  try { return new Date(value).toLocaleString() } catch { return value }
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditLogEvent[]>([])
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getEdition()
      .then(async (info) => {
        if (cancelled) return
        setEdition(info)
        if (!hasFeature(info, 'security.auditLog')) return
        const items = await getAuditLog({ limit: 100 })
        if (!cancelled) setEvents(items)
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit log') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const auditLogEnabled = hasFeature(edition, 'security.auditLog')

  return (
    <AppShell title="Audit Log" subtitle="Governance record of sensitive admin, workspace, and automation actions.">
      <section style={{ display: 'grid', gap: 16 }}>
        <div style={{ border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', borderRadius: 18, padding: 18 }}>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Audit Log</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>Latest platform-level security and automation events.</div>
        </div>
        {error ? <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div> : null}
        {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading audit events…</div> : !auditLogEnabled ? (
          <EnterpriseLockedCard
            title="Audit Log"
            description="Governance event history, sensitive admin action tracking, and compliance exports are available in Sally Enterprise. Community keeps the Admin section visible but locks the audit event feed."
          />
        ) : (
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
