'use client'

import Link from 'next/link'
import { getWorkspaceId } from '../lib/auth'
import { workspaceProjectPath } from '../lib/routes'

export type ProjectIslandView = 'tasks' | 'board' | 'automation' | 'timesheets'

export function ProjectTabs({ projectId, current }: { projectId: string; current: ProjectIslandView }) {
  const projectHref = workspaceProjectPath(getWorkspaceId(), projectId)
  const items = [
    { key: 'tasks', href: projectHref, label: 'Tasks' },
    { key: 'board', href: `${projectHref}?view=board`, label: 'Board' },
    { key: 'automation', href: `${projectHref}?view=automation`, label: 'Agent automation' },
    { key: 'timesheets', href: `${projectHref}?view=timesheets`, label: 'Timesheets' },
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
