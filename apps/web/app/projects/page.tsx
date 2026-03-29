'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell, panel, pill } from '../../components/app-shell'
import { archiveProject, createProject } from '../../lib/api'
import { getWorkspaceId, loadSession } from '../../lib/auth'
import { canEditProject } from '../../lib/permissions'
import { labelText, taskTitleText } from '../../lib/theme'
import { qk, useClientsQuery, useProjectsQuery } from '../../lib/query'

export default function ProjectsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [showArchived, setShowArchived] = useState(false)
  const [clientFilter, setClientFilter] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const session = useMemo(() => loadSession(), [])
  const { data: projects = [], error } = useProjectsQuery({ archived: showArchived })
  const { data: clients = [] } = useClientsQuery()
  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const projectEditDecision = canEditProject({ accountId: session?.account?.id ?? null, platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole: null }, { archived: false })

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

  async function handleCreateProject() {
    const name = newProjectName.trim()
    if (!name || creatingProject) return
    setCreatingProject(true)
    try {
      const created = await createProject({ name })
      setNewProjectName('')
      await qc.invalidateQueries({ queryKey: ['projects'] })
      await qc.invalidateQueries({ queryKey: qk.projectsSummary })
      router.push(`/projects/${created.projectId}`)
    } finally {
      setCreatingProject(false)
    }
  }

  return (
    <AppShell title="Projects" subtitle="Project portfolio with simple health and workload view.">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, ...labelText, color: 'var(--text-secondary)', fontSize: 13 }}>
          Client
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={{ border: '1px solid var(--form-border)', borderRadius: 999, padding: '6px 12px', fontWeight: 600, background: 'var(--form-bg)', minWidth: 200 }}>
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setShowArchived((prev) => !prev)} style={{ background: 'var(--form-bg)', color: 'var(--text-primary)', border: '1px solid var(--form-border)', borderRadius: 999, padding: '6px 12px', fontWeight: 700, fontSize: 12 }}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>
      <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
        {!showArchived && projectEditDecision.visible ? (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--panel-border)' }}>
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleCreateProject()
                }
              }}
              placeholder={creatingProject ? 'Creating project…' : 'Add project title and press Enter'}
              disabled={creatingProject || !projectEditDecision.allowed}
              style={{ width: '100%', border: '1px solid var(--form-border)', borderRadius: 16, padding: '14px 16px', background: 'var(--form-bg)', fontSize: 14 }}
            />
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: showArchived ? '2fr 1.4fr 1fr 1fr 140px' : '2fr 1.4fr 1fr 1fr 1fr', padding: '14px 18px', ...labelText, fontSize: 13, borderBottom: '1px solid var(--panel-border)' }}>
          <div>Name</div><div>Client</div><div>Lead</div><div>Tasks</div><div>{showArchived ? 'Restore' : 'Status'}</div>
        </div>
        {filteredProjects.map((project) => (
          showArchived ? (
            <div key={project.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 140px', padding: '16px 18px', borderBottom: '1px solid var(--panel-border)', alignItems: 'center', color: 'var(--text-primary)' }}>
              <Link href={`/projects/${project.id}?archived=true`} style={{ ...taskTitleText, fontWeight: 700, textDecoration: 'none' }}>{project.name}</Link>
              <div style={{ color: 'var(--text-secondary)' }}>{project.client ? project.client.name : '—'}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{project.lead}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{project.tasks}</div>
              {projectEditDecision.visible ? (
                <button onClick={() => void restoreProject(project.id)} disabled={restoringId === project.id || !projectEditDecision.allowed} style={{ background: 'var(--form-bg)', color: 'var(--text-primary)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '8px 12px', fontWeight: 700 }}>
                  {restoringId === project.id ? 'Restoring…' : 'Restore'}
                </button>
              ) : null}
            </div>
          ) : (
            <Link key={project.id} href={`/projects/${project.id}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr 1fr 1fr', padding: '16px 18px', borderBottom: '1px solid var(--panel-border)', alignItems: 'center', textDecoration: 'none', color: 'var(--text-primary)' }}>
              <div style={{ ...taskTitleText, fontWeight: 700 }}>{project.name}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{project.client ? project.client.name : '—'}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{project.lead}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{project.tasks}</div>
              <div>
                <span style={pill(project.status === 'Active' ? '#dcfce7' : project.status === 'Review' ? '#fef3c7' : '#e2e8f0', project.status === 'Active' ? '#166534' : project.status === 'Review' ? '#92400e' : '#334155')}>
                  {project.status}
                </span>
              </div>
            </Link>
          )
        ))}
        {!filteredProjects.length ? <div style={{ padding: 18, color: 'var(--text-muted)' }}>No projects match the current filters.</div> : null}
        {error ? <div style={{ padding: 18, color: 'var(--danger-text)' }}>{error instanceof Error ? error.message : 'Failed to load projects'}</div> : null}
      </div>
    </AppShell>
  )
}
