'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AuditLogEvent, EditionInfo } from '@sally/types/src'
import { AppShell } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { auditLogCsvUrl, getAuditLog, getEdition } from '../../lib/api'
import { getSessionToken } from '../../lib/auth'
import { hasFeature } from '../../lib/edition'

function formatDate(value: string) {
  try { return new Date(value).toLocaleString() } catch { return value }
}

type AuditFilters = { action: string; targetType: string; actorAccountId: string; workspaceId: string; from: string; to: string; limit: number }

const emptyFilters: AuditFilters = { action: '', targetType: '', actorAccountId: '', workspaceId: '', from: '', to: '', limit: 100 }

function apiFilters(filters: AuditFilters) {
  return {
    action: filters.action.trim() || undefined,
    targetType: filters.targetType.trim() || undefined,
    actorAccountId: filters.actorAccountId.trim() || undefined,
    workspaceId: filters.workspaceId.trim() || undefined,
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    to: filters.to ? new Date(filters.to).toISOString() : undefined,
    limit: filters.limit,
  }
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditLogEvent[]>([])
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters)
  const [selected, setSelected] = useState<AuditLogEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestFilters = useMemo(() => apiFilters(filters), [filters])

  const loadAuditLog = async (activeFilters = requestFilters) => {
    setLoading(true)
    setError(null)
    try {
      const [info] = edition ? [edition] : [await getEdition()]
      setEdition(info)
      if (!hasFeature(info, 'security.auditLog')) return
      const items = await getAuditLog(activeFilters)
      setEvents(items)
      setSelected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAuditLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const auditLogEnabled = hasFeature(edition, 'security.auditLog')

  const exportCsv = async () => {
    setExporting(true)
    setError(null)
    try {
      const token = getSessionToken()
      const response = await fetch(auditLogCsvUrl(requestFilters), { headers: token ? { 'X-Session-Token': token } : {} })
      if (!response.ok) throw new Error(`CSV export failed (${response.status})`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sally-audit-log.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export audit log')
    } finally {
      setExporting(false)
    }
  }

  return (
    <AppShell title="Audit Log" subtitle="Governance record of sensitive admin, workspace, and automation actions.">
      <section style={{ display: 'grid', gap: 16 }}>
        <div style={{ border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', borderRadius: 18, padding: 18 }}>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Audit Log</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>Searchable Enterprise history for security, license, key, admin, and automation events.</div>
        </div>
        {error ? <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div> : null}
        {loading && !edition ? <div style={{ color: 'var(--text-muted)' }}>Loading audit events…</div> : !auditLogEnabled ? (
          <EnterpriseLockedCard
            title="Audit Log"
            description="Governance event history, sensitive admin action tracking, and compliance exports are available in Sally Enterprise. Community keeps the Admin section visible but locks the audit event feed."
          />
        ) : (
          <>
            <div style={{ border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', borderRadius: 18, padding: 14, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <FilterInput label="Action" value={filters.action} onChange={(value) => setFilters((current) => ({ ...current, action: value }))} placeholder="audit.auth.loginSucceeded" />
                <FilterInput label="Target type" value={filters.targetType} onChange={(value) => setFilters((current) => ({ ...current, targetType: value }))} placeholder="apiKey, license, workspace" />
                <FilterInput label="Actor account ID" value={filters.actorAccountId} onChange={(value) => setFilters((current) => ({ ...current, actorAccountId: value }))} placeholder="account id" />
                <FilterInput label="Workspace ID" value={filters.workspaceId} onChange={(value) => setFilters((current) => ({ ...current, workspaceId: value }))} placeholder="workspace id" />
                <FilterInput label="From" type="datetime-local" value={filters.from} onChange={(value) => setFilters((current) => ({ ...current, from: value }))} />
                <FilterInput label="To" type="datetime-local" value={filters.to} onChange={(value) => setFilters((current) => ({ ...current, to: value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void loadAuditLog(apiFilters(filters))} style={buttonStyle}>{loading ? 'Loading…' : 'Apply filters'}</button>
                <button type="button" onClick={() => { setFilters(emptyFilters); void loadAuditLog(apiFilters(emptyFilters)) }} style={secondaryButtonStyle}>Reset</button>
                <button type="button" onClick={() => void exportCsv()} style={secondaryButtonStyle}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {events.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No audit events match these filters.</div> : null}
              {events.map((event) => (
                <button key={event.id} type="button" onClick={() => setSelected(event)} style={{ border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', borderRadius: 14, padding: 14, display: 'grid', gap: 8, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{event.action}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(event.createdAt)}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{event.summary || 'No summary'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>actor: {event.actor?.email || 'system'}</span>
                    <span>target: {event.targetType || '—'} {event.targetId || ''}</span>
                  </div>
                </button>
              ))}
            </div>
            {selected ? (
              <div style={{ border: '1px solid var(--panel-border)', background: 'var(--panel-bg)', borderRadius: 18, padding: 16, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Event detail</strong>
                  <button type="button" onClick={() => setSelected(null)} style={secondaryButtonStyle}>Close</button>
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowX: 'auto', color: 'var(--text-secondary)', fontSize: 12 }}>{JSON.stringify(selected, null, 2)}</pre>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  )
}

function FilterInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', color: 'var(--text-primary)', padding: '10px 12px' }} />
    </label>
  )
}

const buttonStyle: CSSProperties = { border: 'none', borderRadius: 12, background: 'var(--accent-primary)', color: '#fff', padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }
const secondaryButtonStyle: CSSProperties = { border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', color: 'var(--text-primary)', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }
