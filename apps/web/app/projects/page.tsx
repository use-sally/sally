'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AppShell, panel, pill } from '../../components/app-shell'
import { CreateProjectModal } from '../../components/create-project-modal'
import { useProjectsQuery } from '../../lib/query'

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: projects = [], error } = useProjectsQuery()

  return (
    <AppShell title="Projects" subtitle="Project portfolio with simple health and workload view." actions={<button onClick={() => setShowCreate(true)} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>New project</button>}>
      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 1fr', padding: '14px 18px', color: '#64748b', fontSize: 13, fontWeight: 700, borderBottom: '1px solid #eef2f7' }}>
          <div>Name</div><div>Client</div><div>Lead</div><div>Tasks</div><div>Status</div>
        </div>
        {projects.map((project) => (
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
        ))}
        {error ? <div style={{ padding: 18, color: '#991b1b' }}>{error instanceof Error ? error.message : 'Failed to load projects'}</div> : null}
      </div>
      {showCreate ? <CreateProjectModal onClose={() => setShowCreate(false)} /> : null}
    </AppShell>
  )
}
