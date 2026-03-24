'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell, panel, pill } from '../../components/app-shell'
import { CreateProjectModal } from '../../components/create-project-modal'
import { archiveProject } from '../../lib/api'
import { qk, useClientsQuery, useProjectsQuery } from '../../lib/query'

export default function ProjectsPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [clientFilter, setClientFilter] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const { data: projects = [], error } = useProjectsQuery({ archived: showArchived })
  const { data: clients = [] } = useClientsQuery()

  const filteredProjects = clientFilter ? projects.filter((project) => project.client?.id === clientFilter) : projects

  async function restoreProject(projectId: string) {
    if (!projectId) return
    setRestoringId(projectId)
    try {
      await archiveProject(projectId, false)
      await qc.invalidateQueries({ queryKey: ['projects'] })
      await qc.invalidateQueries({ queryKey: qk.projectsSummary })
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <AppShell title="Projects" subtitle="Project portfolio with simple health and workload view." actions={<button onClick={() => setShowCreate(true)} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>New project</button>}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600, color: '#475569' }}>
          Client
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={{ border: '1px solid #dbe1ea', borderRadius: 999, padding: '6px 12px', fontWeight: 600, background: '#fff', minWidth: 200 }}>
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setShowArchived((prev) => !prev)} style={{ background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 12 }}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>
      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: showArchived ? '2fr 1.4fr 1fr 1fr 140px' : '2fr 1.4fr 1fr 1fr 1fr', padding: '14px 18px', color: '#64748b', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #eef2f7' }}>
          <div>Name</div><div>Client</div><div>Lead</div><div>Tasks</div><div>{showArchived ? 'Restore' : 'Status'}</div>
        </div>
        {filteredProjects.map((project) => (
          showArchived ? (
            <div key={project.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 140px', padding: '16px 18px', borderBottom: '1px solid #eef2f7', alignItems: 'center', color: '#0f172a' }}>
              <Link href={`/projects/${project.id}?archived=true`} style={{ fontWeight: 700, textDecoration: 'none', color: '#0f172a' }}>{project.name}</Link>
              <div style={{ color: '#475569' }}>{project.client ? project.client.name : '—'}</div>
              <div style={{ color: '#475569' }}>{project.lead}</div>
              <div style={{ color: '#475569' }}>{project.tasks}</div>
              <button onClick={() => void restoreProject(project.id)} disabled={restoringId === project.id} style={{ background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 10, padding: '8px 12px', fontWeight: 700 }}>
                {restoringId === project.id ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ) : (
            <Link key={project.id} href={`/projects/${project.id}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 1fr', padding: '16px 18px', borderBottom: '1px solid #eef2f7', alignItems: 'center', textDecoration: 'none', color: '#0f172a' }}>
              <div style={{ fontWeight: 700 }}>{project.name}</div>
              <div style={{ color: '#475569' }}>{project.client ? project.client.name : '—'}</div>
              <div style={{ color: '#475569' }}>{project.lead}</div>
              <div style={{ color: '#475569' }}>{project.tasks}</div>
              <div>
                <span style={pill(project.status === 'Active' ? '#dcfce7' : project.status === 'Review' ? '#fef3c7' : '#e2e8f0', project.status === 'Active' ? '#166534' : project.status === 'Review' ? '#92400e' : '#334155')}>
                  {project.status}
                </span>
              </div>
            </Link>
          )
        ))}
        {!filteredProjects.length ? <div style={{ padding: 18, color: '#64748b' }}>No projects match the current filters.</div> : null}
        {error ? <div style={{ padding: 18, color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load projects'}</div> : null}
      </div>
      {showCreate ? <CreateProjectModal onClose={() => setShowCreate(false)} /> : null}
    </AppShell>
  )
}
