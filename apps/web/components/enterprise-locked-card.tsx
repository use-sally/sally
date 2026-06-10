'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { getLicense } from '../lib/api'

const enterpriseCheckoutUrl = 'https://usesally.com/sponsorships?checkout=enterprise'

export function EnterpriseLockedCard({ title, description, children, badge = 'Enterprise feature', ctaLabel = 'Upgrade to Enterprise', ctaHref = enterpriseCheckoutUrl, hideCtaWhenEnterprise = true }: { title: string; description: string; children?: ReactNode; badge?: string; ctaLabel?: string; ctaHref?: string; hideCtaWhenEnterprise?: boolean }) {
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
        <h3 style={{ margin: 0, color: 'var(--heading-text)', fontSize: 'var(--font-16)' }}>{title}</h3>
        <span style={{ border: '1px solid rgba(250, 204, 21, 0.32)', borderRadius: 999, padding: '4px 8px', color: 'var(--task-title)', fontSize: 'var(--font-11)', fontWeight: 700 }}>
          {badge}
        </span>
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55, fontSize: 'var(--font-13)' }}>{description}</p>
      {children ? <div>{children}</div> : null}
      {hideCtaWhenEnterprise && hasActiveLicense ? null : (
        <a href={ctaHref} target="_blank" rel="noreferrer" style={{ color: 'var(--task-title)', fontSize: 'var(--font-13)', fontWeight: 700 }}>
          {ctaLabel}
        </a>
      )}
    </section>
  )
}
