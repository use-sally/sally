'use client'

import Link from 'next/link'

export type ProjectIslandView = 'tasks' | 'board' | 'automation' | 'timesheets'

export function ProjectTabs({ projectId, current }: { projectId: string; current: ProjectIslandView }) {
  const items = [
    { key: 'tasks', href: `/projects/${projectId}`, label: 'Tasks' },
    { key: 'board', href: `/projects/${projectId}?view=board`, label: 'Board' },
    { key: 'automation', href: `/projects/${projectId}?view=automation`, label: 'Agent automation' },
    { key: 'timesheets', href: `/projects/${projectId}?view=timesheets`, label: 'Timesheets' },
  ] as const

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
      {items.map((item) => {
        const active = item.key === current
        return (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            style={{
              textDecoration: 'none',
              padding: '10px 14px',
              borderRadius: 12,
              fontWeight: 400,
              background: active ? 'rgba(16, 185, 129, 0.10)' : 'var(--form-bg)',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: active ? '1px solid var(--form-border-focus)' : '1px solid var(--form-border)',
            }}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
