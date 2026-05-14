'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { getLicense } from '../lib/api'

const enterpriseCheckoutUrl = 'https://usesally.com/sponsorships?checkout=enterprise'

export function EnterpriseLockedCard({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  const [hasActiveLicense, setHasActiveLicense] = useState(false)

  useEffect(() => {
    let cancelled = false
    getLicense()
      .then((license) => {
        if (cancelled) return
        const active = license.edition === 'ENTERPRISE' && Boolean(license.installed || license.license)
        setHasActiveLicense(active)
      })
      .catch(() => {
        if (!cancelled) setHasActiveLicense(false)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <section
      style={{
        border: '1px solid rgba(250, 204, 21, 0.26)',
        borderRadius: 16,
        background: 'rgba(250, 204, 21, 0.06)',
        padding: 18,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>{title}</h3>
        <span style={{ border: '1px solid rgba(250, 204, 21, 0.32)', borderRadius: 999, padding: '4px 8px', color: 'var(--task-title)', fontSize: 11, fontWeight: 700 }}>
          Enterprise feature
        </span>
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55, fontSize: 13 }}>{description}</p>
      {children ? <div>{children}</div> : null}
      {hasActiveLicense ? null : (
        <a href={enterpriseCheckoutUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--task-title)', fontSize: 13, fontWeight: 700 }}>
          Upgrade to Enterprise
        </a>
      )}
    </section>
  )
}
