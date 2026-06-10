'use client'

import { useEffect, useState } from 'react'
import { AppShell, panel } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { getCrmStatus, getEdition } from '../../lib/api'
import { hasFeature, type EditionInfo } from '../../lib/edition'

export default function CrmPage() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getEdition()
      .then((info) => {
        if (cancelled) return
        setEdition(info)
        if (!hasFeature(info, 'crm.core')) return null
        return getCrmStatus()
      })
      .then((crmStatus) => { if (!cancelled && crmStatus) setStatus(crmStatus.message) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load CRM status') })
    return () => { cancelled = true }
  }, [])

  const enabled = hasFeature(edition, 'crm.core')

  return (
    <AppShell title="CRM" subtitle="Headless customer relationship management for humans and agents.">
      {!enabled ? (
        <EnterpriseLockedCard title="Sally CRM add-on" description="Organizations, people, deals, and activities are an optional Sally add-on designed to be API/MCP-first." />
      ) : (
        <div style={{ ...panel, display: 'grid', gap: 14 }}>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Sally CRM add-on enabled</div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-14)', lineHeight: 1.6 }}>
            {status || 'CRM is enabled. The first implementation surface is reserved for headless API and MCP tools.'}
          </p>
          {error ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{error}</div> : null}
          <div style={{ border: '1px solid var(--panel-border)', borderRadius: 14, padding: 14, color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.6 }}>
            Planned CRM surfaces: organizations, people, deals, activities, project/deal linking, and CRM MCP tools.
          </div>
        </div>
      )}
    </AppShell>
  )
}
