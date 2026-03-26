'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Health, Project, ProjectsSummary } from '@sally/types/src'
import { getHealth, getProjects, getProjectsSummary } from '../lib/api'
import { AppShell, panel, panelHeader, pill } from '../components/app-shell'
import { labelText, metaLabelText, taskTitleText } from '../lib/theme'

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
          <div style={metaLabelText}>Active projects</div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 750, color: 'var(--text-primary)' }}>{summary?.activeProjects ?? '—'}</div>
        </div>
        <div style={panel}>
          <div style={metaLabelText}>Open tasks</div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 750, color: 'var(--text-primary)' }}>{summary?.openTasks ?? '—'}</div>
        </div>
        <div style={panel}>
          <div style={metaLabelText}>Cycle health</div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 750, color: 'var(--text-primary)' }}>{summary?.cycleHealth ?? '—'}</div>
        </div>
        <div style={panel}>
          <div style={metaLabelText}>Backend</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={pill(health?.ok ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)', health?.ok ? '#a7f3d0' : '#fecaca')}>
              {health?.ok ? 'API online' : 'Disconnected'}
            </span>
          </div>
          <div style={{ marginTop: 8, ...labelText }}>{health?.timestamp ? `Last check: ${new Date(health.timestamp).toLocaleTimeString()}` : error ?? 'Waiting for API'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
          <div style={{ ...panelHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Projects</span>
            <span style={labelText}>{projects.length} loaded</span>
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
                  <Link href={`/projects/${project.id}`} style={{ ...taskTitleText, fontWeight: 700, textDecoration: 'none' }}>{project.name}</Link>
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
                  <div style={{ ...labelText, fontSize: 13 }}>{project.tasks} open items</div>
                  <Link href={`/projects/${project.id}`} style={{ textDecoration: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>Open →</Link>
                </div>
              </div>
            ))}
            {!projects.length ? (
              <div style={{ padding: '18px', ...labelText, fontSize: 13 }}>No projects yet.</div>
            ) : null}
          </div>
        </div>

        <div style={{ ...panel, display: 'grid', gap: 14, alignContent: 'start' }}>
          <div>
            <div style={metaLabelText}>Docs + API</div>
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.2 }}>Current docs now track product reality more closely.</div>
          </div>
          <div style={{ ...labelText, fontSize: 13, lineHeight: 1.7 }}>
            Use the docs hub for installation, hosted MCP, API reference, workflow guides, and practical tutorials for humans and agents.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <Link href="/docs" style={{ textDecoration: 'none', color: '#052e16', background: '#fcd34d', border: '1px solid rgba(250, 204, 21, 0.5)', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 800, textAlign: 'center' }}>Open docs hub →</Link>
            <a href="https://github.com/use-sally/sally" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'var(--text-secondary)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>Open repo →</a>
          </div>
          <div style={{ display: 'grid', gap: 8, paddingTop: 4 }}>
            <div style={{ ...labelText, fontSize: 12 }}>Highlights</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
              <li>hosted MCP setup and troubleshooting</li>
              <li>API examples with workspace selection</li>
              <li>tutorials for projects, tasks, invites, and timesheets</li>
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
