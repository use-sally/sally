'use client'

import { useEffect, useState } from 'react'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { workspaceRoleLabel } from '../lib/roles'
import type { Health, ProjectsSummary } from '@sally/types/src'
import { getHealth, getProjectsSummary } from '../lib/api'
import { AppShell, panel, pill } from '../components/app-shell'
import { WorkspaceMembersCard, WorkspaceOverviewPanels } from '../components/workspace-overview-panels'
import { labelText, metaLabelText } from '../lib/theme'
import { appVersion } from '../lib/version'
import { compareVersions, normalizeVersion, updateManifestUrl, type UpdateManifest } from '../lib/update-manifest'

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null)
  const [summary, setSummary] = useState<ProjectsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updateManifest, setUpdateManifest] = useState<UpdateManifest | null>(null)
  const [workspaceName, setWorkspaceName] = useState('Overview')
  const [workspaceMeta, setWorkspaceMeta] = useState('Minimal workspace status for humans and agents.')
  const [workspaceRoleLine, setWorkspaceRoleLine] = useState<string | undefined>(undefined)

  useEffect(() => {
    const session = loadSession()
    const workspaceId = getWorkspaceId()
    const activeWorkspace = session?.memberships?.find((membership) => membership.workspaceId === workspaceId) ?? session?.memberships?.[0]
    if (activeWorkspace?.workspaceName) setWorkspaceName(activeWorkspace.workspaceName)
    if (activeWorkspace?.workspaceId || workspaceId) setWorkspaceMeta(`workspace / ${(activeWorkspace?.workspaceId || workspaceId) ?? '—'}`)
    if (activeWorkspace?.role) setWorkspaceRoleLine(`You are ${workspaceRoleLabel(activeWorkspace.role)} in this workspace`)

    const load = async () => {
      try {
        const [healthData, summaryData] = await Promise.all([getHealth(), getProjectsSummary()])
        setHealth(healthData)
        setSummary(summaryData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown API error')
      }
    }

    const loadUpdateManifest = async () => {
      try {
        const res = await fetch('/api/update-manifest', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as UpdateManifest
        if (!data?.latestVersion) return
        setUpdateManifest({ ...data, latestVersion: normalizeVersion(data.latestVersion) })
      } catch {
        // best-effort only
      }
    }

    void load()
    void loadUpdateManifest()
  }, [])

  const latestVersion = updateManifest?.latestVersion ?? null
  const updateAvailable = latestVersion ? compareVersions(latestVersion, appVersion) > 0 : false

  return (
    <AppShell title={workspaceName} subtitle={workspaceMeta} actions={workspaceRoleLine ? <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>{workspaceRoleLine}</div> : undefined}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
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
        <WorkspaceMembersCard />
        <div style={panel}>
          <div style={metaLabelText}>Backend</div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={pill(health?.ok ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)', health?.ok ? '#a7f3d0' : '#fecaca')}>
              {health?.ok ? 'API online' : 'Disconnected'}
            </span>
            {updateAvailable ? <span style={pill(updateManifest?.breaking ? 'rgba(239, 68, 68, 0.14)' : 'rgba(250, 204, 21, 0.14)', updateManifest?.breaking ? '#fecaca' : '#fde68a')}>{updateManifest?.breaking ? `Update available: v${latestVersion} includes breaking changes` : `New version available: v${latestVersion}`}</span> : null}
          </div>
          <div style={{ marginTop: 8, ...labelText }}>{health?.timestamp ? `Last check: ${new Date(health.timestamp).toLocaleTimeString()}` : error ?? 'Waiting for API'}</div>
          {updateAvailable ? <div style={{ marginTop: 6, ...labelText }}>{`Current version: v${appVersion}`}</div> : null}
          {updateAvailable && updateManifest?.summary ? <div style={{ marginTop: 4, ...labelText }}>{updateManifest.summary}</div> : null}
          {updateAvailable && updateManifest?.docsUrl ? <a href={updateManifest.docsUrl} target="_blank" rel="noreferrer" style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>View update notes →</a> : null}
        </div>
      </div>

      <WorkspaceOverviewPanels />
    </AppShell>
  )
}
