import type { ReactNode } from 'react'

export function EnterpriseLockedCard({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
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
      <a href="https://usesally.app/enterprise" target="_blank" rel="noreferrer" style={{ color: 'var(--task-title)', fontSize: 13, fontWeight: 700 }}>
        Upgrade to Enterprise
      </a>
    </section>
  )
}
