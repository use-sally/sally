'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { getAuditLogPolicy, getEdition, pruneAuditLog, saveAuditLogPolicy } from '../lib/api'
import { hasFeature, type EditionInfo } from '../lib/edition'
import { EnterpriseLockedCard } from './enterprise-locked-card'

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const labelStyle = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }

export function AuditLogPolicyPanel() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [retentionDays, setRetentionDays] = useState('365')
  const [exportRequiresAdmin, setExportRequiresAdmin] = useState(true)
  const [includeAuthEvents, setIncludeAuthEvents] = useState(true)
  const [includeAutomationEvents, setIncludeAutomationEvents] = useState(true)
  const [stats, setStats] = useState({ totalEvents: 0, retainedEvents: 0, prunableEvents: 0 })
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const enabled = hasFeature(edition, 'security.auditLog')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await getEdition()
      setEdition(info)
      if (!hasFeature(info, 'security.auditLog')) return
      const result = await getAuditLogPolicy()
      setRetentionDays(String(result.policy.retentionDays))
      setExportRequiresAdmin(result.policy.exportRequiresAdmin)
      setIncludeAuthEvents(result.policy.includeAuthEvents)
      setIncludeAutomationEvents(result.policy.includeAutomationEvents)
      setStats(result.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log policy')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await saveAuditLogPolicy({ retentionDays: Math.max(30, Math.min(3650, Math.floor(Number(retentionDays || 365)))), exportRequiresAdmin, includeAuthEvents, includeAutomationEvents })
      setNotice('Audit log policy saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save audit log policy')
    } finally {
      setWorking(false)
    }
  }

  const prune = async () => {
    if (!window.confirm(`Delete ${stats.prunableEvents} audit event${stats.prunableEvents === 1 ? '' : 's'} older than the retention window?`)) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const result = await pruneAuditLog()
      setNotice(`Deleted ${result.deletedEvents} audit event${result.deletedEvents === 1 ? '' : 's'}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prune audit log')
    } finally {
      setWorking(false)
    }
  }

  if (!loading && !enabled) {
    return (
      <EnterpriseLockedCard title="Audit log" description="Search and export security-relevant activity such as role changes, membership changes, login events, and agent connections.">
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}>Visible in Community; editable in Enterprise.</div>
      </EnterpriseLockedCard>
    )
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 'var(--font-16)' }}>Audit log</h3>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.55 }}>Enterprise audit retention, export, and visibility controls.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Stat label="Total events" value={stats.totalEvents} />
        <Stat label="Retained" value={stats.retainedEvents} />
        <Stat label="Prunable" value={stats.prunableEvents} />
      </div>
      {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
      {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label style={labelStyle}>Retention days<input inputMode="numeric" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={exportRequiresAdmin} onChange={(event) => setExportRequiresAdmin(event.target.checked)} /> Require platform admin role for CSV export</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={includeAuthEvents} onChange={(event) => setIncludeAuthEvents(event.target.checked)} /> Include authentication events in default audit views</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-13)' }}><input type="checkbox" checked={includeAutomationEvents} onChange={(event) => setIncludeAutomationEvents(event.target.checked)} /> Include automation events in default audit views</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" disabled={working || loading} style={{ border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Save audit policy</button>
          <button type="button" disabled={working || loading || stats.prunableEvents === 0} onClick={prune} style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'transparent', color: '#fecaca', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading || stats.prunableEvents === 0 ? 0.5 : 1 }}>Prune old events</button>
          <Link href="/audit-log" style={{ border: '1px solid var(--panel-border)', background: 'var(--form-bg)', color: 'var(--text-primary)', borderRadius: 12, padding: '10px 14px', fontWeight: 750, textDecoration: 'none' }}>Open audit log</Link>
        </div>
      </form>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div style={{ border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', padding: 12 }}><div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-12)' }}>{label}</div><div style={{ color: 'var(--heading-text)', fontSize: 'var(--font-18)', fontWeight: 800 }}>{value}</div></div>
}
