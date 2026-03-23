'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BoardColumn, Project } from '@automatethis-pm/types/src'
import { AppShell } from '../../components/app-shell'
import { TaskBoard } from '../../components/task-board'
import { CreateTaskModal } from '../../components/create-task-modal'
import { getBoard, getProjects } from '../../lib/api'

export default function BoardPage() {
  const initialProjectId = ''

  const [columns, setColumns] = useState<BoardColumn[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadProjects() {
    const projectData = await getProjects()
    setProjects(projectData)
    const preferred = initialProjectId || selectedProjectId || projectData[0]?.id || ''
    if (preferred && preferred !== selectedProjectId) setSelectedProjectId(preferred)
    return preferred
  }

  async function loadBoard(projectIdOverride?: string) {
    try {
      const pid = projectIdOverride ?? selectedProjectId
      if (!pid) return
      setColumns(await getBoard(pid))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board')
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const pid = await loadProjects()
        if (pid) await loadBoard(pid)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load board')
      }
    })()
  }, [])

  useEffect(() => {
    if (selectedProjectId) void loadBoard(selectedProjectId)
  }, [selectedProjectId])

  const selectedProject = useMemo(() => projects.find((p) => p.id === selectedProjectId) ?? null, [projects, selectedProjectId])

  return (
    <AppShell
      title="Board"
      subtitle={selectedProject ? `Kanban view for ${selectedProject.name}.` : 'Kanban-style view for the current cycle.'}
      actions={
        <>
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} style={{ border: '1px solid #dbe1ea', borderRadius: 12, padding: '11px 12px', background: '#fff', fontWeight: 600 }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>New task</button>
        </>
      }
    >
      {error ? <div style={{ color: '#991b1b', marginBottom: 16 }}>{error}</div> : null}
      {columns.length ? <TaskBoard columns={columns} taskBaseHref={selectedProjectId ? `/projects/${selectedProjectId}/board` : '/board'} projectId={selectedProjectId} /> : <div style={{ color: '#64748b' }}>Loading board…</div>}
      {showCreate ? <CreateTaskModal projects={projects} defaultProjectId={selectedProjectId} onClose={() => setShowCreate(false)} onCreated={() => loadBoard()} /> : null}
    </AppShell>
  )
}
