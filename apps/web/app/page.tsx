'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Health, Project, ProjectsSummary } from '@sally/types/src'
import { getHealth, getProjects, getProjectsSummary } from '../lib/api'
import { AppShell, panel, panelHeader, pill } from '../components/app-shell'

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null)
  const [summary, setSummary] = useState<ProjectsSummary | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [healthData, summaryData, projectData] = await Promise.all([getHealth(), getProjectsSummary(), getProjects()])
        setHealth(healthData)
        setSummary(summaryData)
        setProjects(projectData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown API error')
      }
    }
    void load()
  }, [])

  return (
    <AppShell title="Overview" subtitle="Minimal workspace status for humans and agents.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={panel}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active projects</div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 750, color: 'var(--text-primary)' }}>{summary?.activeProjects ?? '—'}</div>
        </div>
        <div style={panel}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Open tasks</div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 750, color: 'var(--text-primary)' }}>{summary?.openTasks ?? '—'}</div>
        </div>
        <div style={panel}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cycle health</div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 750, color: 'var(--text-primary)' }}>{summary?.cycleHealth ?? '—'}</div>
        </div>
        <div style={panel}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Backend</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={pill(health?.ok ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)', health?.ok ? '#a7f3d0' : '#fecaca')}>
              {health?.ok ? 'API online' : 'Disconnected'}
            </span>
          </div>
          <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>{health?.timestamp ? `Last check: ${new Date(health.timestamp).toLocaleTimeString()}` : error ?? 'Waiting for API'}</div>
        </div>
      </div>

      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        <div style={{ ...panelHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Projects</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{projects.length} loaded</span>
        </div>
        <div style={{ display: 'grid' }}>
          {projects.map((project, index) => (
            <div
              key={project.id}
              style={{
                padding: '16px 18px',
                borderTop: index === 0 ? '1px solid transparent' : '1px solid rgba(16, 185, 129, 0.10)',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <Link href={`/projects/${project.id}`} style={{ fontWeight: 700, textDecoration: 'none', color: 'var(--text-primary)' }}>{project.name}</Link>
                <span style={pill(
                  project.status === 'Active'
                    ? 'rgba(16, 185, 129, 0.14)'
                    : project.status === 'Review'
                      ? 'rgba(250, 204, 21, 0.14)'
                      : 'rgba(148, 163, 184, 0.14)',
                  project.status === 'Active'
                    ? '#a7f3d0'
                    : project.status === 'Review'
                      ? '#fde68a'
                      : '#cbd5e1'
                )}>{project.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{project.tasks} open items</div>
                <Link href={`/projects/${project.id}`} style={{ textDecoration: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>Open →</Link>
              </div>
            </div>
          ))}
          {!projects.length ? (
            <div style={{ padding: '18px', color: 'var(--text-muted)', fontSize: 13 }}>No projects yet.</div>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}
