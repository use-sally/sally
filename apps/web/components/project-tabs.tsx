'use client'

import Link from 'next/link'

export function ProjectTabs({ projectId, current }: { projectId: string; current: 'overview' | 'board' | 'tasks' }) {
  const items = [
    { key: 'overview', href: `/projects/${projectId}`, label: 'Overview' },
    { key: 'board', href: `/projects/${projectId}/board`, label: 'Board' },
    { key: 'tasks', href: `/projects/${projectId}/tasks`, label: 'Tasks' },
  ] as const

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
      {items.map((item) => {
        const active = item.key === current
        return (
          <Link
            key={item.key}
            href={item.href}
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
