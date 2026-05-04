'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ProjectTasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    void params.then((p) => setProjectId(p.projectId))
  }, [params])

  useEffect(() => {
    if (!projectId) return
    const next = new URLSearchParams(searchParams.toString())
    next.set('view', 'tasks')
    router.replace(`/projects/${projectId}?${next.toString()}`)
  }, [projectId, router, searchParams])

  return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Opening project tasks…</div>
}
