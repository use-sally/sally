'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Health, Project, ProjectsSummary } from '@automatethis-pm/types/src'
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
    <AppShell title="Overview" subtitle="First visible shell for the modern rebuild.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>Active projects</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{summary?.activeProjects ?? '—'}</div></div>
        <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>Open tasks</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{summary?.openTasks ?? '—'}</div></div>
        <div style={panel}><div style={{ color: '#64748b', fontSize: 14 }}>Cycle health</div><div style={{ marginTop: 10, fontSize: 28, fontWeight: 750 }}>{summary?.cycleHealth ?? '—'}</div></div>
        <div style={panel}>
          <div style={{ color: '#64748b', fontSize: 14 }}>Backend</div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={pill(health?.ok ? '#dcfce7' : '#fee2e2', health?.ok ? '#166534' : '#991b1b')}>{health?.ok ? 'API online' : 'Disconnected'}</span>
          </div>
          <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>{health?.timestamp ? `Last check: ${new Date(health.timestamp).toLocaleTimeString()}` : error ?? 'Waiting for API'}</div>
        </div>
      </div>

      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        <div style={panelHeader}>Projects</div>
        <div style={{ display: 'grid' }}>
          {projects.map((project, index) => (
            <div key={project.id} style={{ padding: '16px 18px', borderTop: index === 0 ? '1px solid transparent' : '1px solid #eef2f7', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <Link href={`/projects/${project.id}`} style={{ fontWeight: 700, textDecoration: 'none', color: '#0f172a' }}>{project.name}</Link>
                <span style={pill(project.status === 'Active' ? '#dcfce7' : project.status === 'Review' ? '#fef3c7' : '#e2e8f0', project.status === 'Active' ? '#166534' : project.status === 'Review' ? '#92400e' : '#334155')}>{project.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#64748b', fontSize: 14 }}>{project.tasks} open items</div>
                <Link href={`/projects/${project.id}`} style={{ textDecoration: 'none', color: '#334155', fontSize: 14, fontWeight: 700 }}>Open →</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
