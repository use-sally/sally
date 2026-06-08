'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { resolveApprovalRequest, resolveBlocker, revokeAgentConnection } from '../lib/api'
import { qk, useProjectAutomationQuery } from '../lib/query'
import { panel, pill } from './app-shell'
import { InfoFlag } from './info-flag'
import { useQueryClient } from '@tanstack/react-query'

const PLAN_FIRST_WORKFLOW_INFO = `Plan-first workflow model
Sally uses one connected local agent for the MVP. Planning, building, review, and testing are internal workflow modes, not separate user-facing agents.
First step: audit project → create or update visible tasks → execute from those cards.
Internal modes: Planning → Building → Reviewing/Testing → Done or Waiting for approval/blocker.
Live actions approval: required · staging first: yes`

function workflowModeLabel(role: string | null | undefined) {
  const normalized = role?.toLowerCase()
  if (normalized === 'pm') return 'Planning'
  if (normalized === 'architect') return 'Designing'
  if (normalized === 'coder') return 'Building'
  if (normalized === 'reviewer') return 'Reviewing'
  if (normalized === 'tester') return 'Testing'
  if (normalized === 'infra') return 'Deploying'
  if (normalized === 'marketer') return 'Marketing'
  return normalized || 'Workflow'
}

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—'
}

function formatUpdatedAt(value: number | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function jobStatusTone(status: string) {
  if (status === 'QUEUED') return '#92400e'
  if (status === 'RUNNING' || status === 'CLAIMED') return '#1d4ed8'
  if (status === 'SUCCEEDED') return '#166534'
  if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'CANCELLED') return '#991b1b'
  if (status === 'ONLINE') return '#166534'
  if (status === 'REVOKED') return '#991b1b'
  return 'var(--text-secondary)'
}

export function ProjectAutomationPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading, error, dataUpdatedAt } = useProjectAutomationQuery(projectId)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const config = data?.config ?? null
  const jobs = data?.jobs ?? []
  const runs = data?.runs ?? []
  const connections = (data?.connections ?? []).filter((connection) => !connection.revokedAt && connection.status !== 'REVOKED')
  const blockers = data?.blockers ?? []
  const approvalRequests = data?.approvalRequests ?? []
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: qk.projectAutomation(projectId) })
  }

  const handleRevokeConnection = async (connectionId: string) => {
    setSaving(true)
    setErrorMessage(null)
    try {
      await revokeAgentConnection(connectionId)
      await refresh()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to revoke connection')
    } finally {
      setSaving(false)
    }
  }

  const handleResolveApproval = async (approvalRequestId: string, status: 'APPROVED' | 'REJECTED') => {
    setSaving(true)
    setErrorMessage(null)
    try {
      await resolveApprovalRequest(approvalRequestId, { status })
      await refresh()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to resolve approval')
    } finally {
      setSaving(false)
    }
  }

  const handleResolveBlocker = async (blockerId: string, status: 'RESOLVED' | 'CANCELLED') => {
    setSaving(true)
    setErrorMessage(null)
    try {
      await resolveBlocker(blockerId, { status })
      await refresh()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to resolve blocker')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div style={panel}>Loading automation…</div>
  if (error) return <div style={{ ...panel, color: 'var(--danger-text)' }}>{error instanceof Error ? error.message : 'Failed to load automation'}</div>

  return (
    <div style={{ ...panel, display: 'grid', gap: 14, minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={automationPanelHeadingText}>Agent automation</div>
            <InfoFlag text={PLAN_FIRST_WORKFLOW_INFO} align="left" />
            {dataUpdatedAt ? <span style={automationUpdatedText}>updated {formatUpdatedAt(dataUpdatedAt)}</span> : null}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, minWidth: 0 }}>
        <Metric label="State" value={config?.automationState ?? 'not configured'} />
        <Metric label="Current phase" value={config?.currentStage ?? 'INTAKE'} />
        <Metric label="Next step" value={workflowModeLabel(config?.nextRole)} />
        <Metric label="Jobs" value={String(jobs.length)} />
        <Metric label="Runs" value={String(runs.length)} />
        <Metric label="Connected agent" value={connections.length ? 'connected' : 'not connected'} />
        <Metric label="Open blockers" value={String(blockers.length)} />
        <Metric label="Pending approvals" value={String(approvalRequests.length)} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['plan first', 'visible task plan', 'single connected agent', 'approval gates stay visible'].map((capability) => <span key={capability} style={pill('var(--form-bg)', 'var(--text-secondary)')}>{capability}</span>)}
      </div>
      {errorMessage ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{errorMessage}</div> : null}

      {(blockers.length || approvalRequests.length) ? <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: 12, background: 'rgba(239,68,68,0.07)' }}>
        <div style={automationPanelHeadingText}>Attention required</div>
        {approvalRequests.slice(0, 5).map((approval) => <div key={approval.id} style={{ display: 'grid', gap: 6, color: 'var(--text-primary)', fontSize: 'var(--font-13)' }}>
          <div><span style={pill('#fef3c7', '#92400e')}>APPROVAL</span> <strong>{approval.type}</strong> · {approval.question}</div>
          {approval.recommendation ? <div style={{ color: 'var(--text-muted)' }}>{approval.recommendation}</div> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={!canManage || saving} onClick={() => void handleResolveApproval(approval.id, 'APPROVED')} style={primaryButton(true)}>Approve</button>
            <button type="button" disabled={!canManage || saving} onClick={() => void handleResolveApproval(approval.id, 'REJECTED')} style={dangerButton}>Deny</button>
          </div>
        </div>)}
        {blockers.slice(0, 5).map((blocker) => <div key={blocker.id} style={{ display: 'grid', gap: 6, color: 'var(--text-primary)', fontSize: 'var(--font-13)' }}>
          <div><span style={pill('#fee2e2', '#991b1b')}>BLOCKER</span> <strong>{blocker.type}</strong> · {blocker.summary}</div>
          {blocker.requiredInput ? <div style={{ color: 'var(--text-muted)' }}>Needed: {blocker.requiredInput}</div> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={!canManage || saving} onClick={() => void handleResolveBlocker(blocker.id, 'RESOLVED')} style={primaryButton(true)}>Resolve</button>
            <button type="button" disabled={!canManage || saving} onClick={() => void handleResolveBlocker(blocker.id, 'CANCELLED')} style={dangerButton}>Cancel</button>
          </div>
        </div>)}
      </div> : null}

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={automationSectionHeadingText}>Connected agent</div>
        </div>
        {connections.length ? (
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            {connections.slice(0, 8).map((connection) => {
              const tone = jobStatusTone(connection.status)
              return <div key={connection.id} style={automationConnectionRowGrid}>
                <span style={automationStatusText(tone)}>{connection.status}</span>
                <span style={automationDateText}>{formatTime(connection.lastSeenAt || connection.updatedAt)}</span>
                <span style={automationRoleText}>{connection.runtimeType}{connection.profileRef ? ` · ${connection.profileRef}` : ''}</span>
                <span style={automationCommentText}>{connection.name}</span>
                <button type="button" disabled={!canManage || saving || connection.status === 'REVOKED'} onClick={() => void handleRevokeConnection(connection.id)} style={primaryButton(false)}>Revoke</button>
              </div>
            })}
          </div>
        ) : <div style={{ color: 'var(--text-muted)' }}>No local agent connected yet.</div>}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={automationSectionHeadingText}>Recent workflow steps</div>
        {jobs.length ? (
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            {jobs.slice(0, 8).map((job) => {
              const tone = jobStatusTone(job.status)
              return <div key={job.id} style={automationRowGrid}>
                <span style={automationStatusText(tone)}>{job.status}</span>
                <span style={automationDateText}>{formatTime(job.createdAt)}</span>
                <span style={automationRoleText}>{workflowModeLabel(job.role)}</span>
                <span style={automationCommentText}>{job.mode} · {job.agent?.name || 'connected agent'} · step {job.workflowStep ?? '—'}/{job.maxSteps ?? '—'}</span>
              </div>
            })}
          </div>
        ) : <div style={{ color: 'var(--text-muted)' }}>No automation jobs yet.</div>}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={automationSectionHeadingText}>Recent automation runs</div>
        {runs.length ? (
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            {runs.slice(0, 8).map((run) => {
              const tone = jobStatusTone(run.status)
              return <div key={run.id} style={automationRowGrid}>
                <span style={automationStatusText(tone)}>{run.status}</span>
                <span style={automationDateText}>{formatTime(run.finishedAt || run.latestHeartbeatAt || run.startedAt || run.createdAt)}</span>
                <span style={automationRoleText}>{workflowModeLabel(run.role)}</span>
                <span style={automationCommentText}>{run.summary || run.error || run.triggerType}</span>
              </div>
            })}
          </div>
        ) : <div style={{ color: 'var(--text-muted)' }}>No automation runs yet.</div>}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)', minWidth: 0 }}><div style={smallLabel}>{label}</div><div style={{ color: 'var(--text-primary)', fontWeight: 800, marginTop: 4, overflowWrap: 'anywhere' }}>{value}</div></div>
}

function primaryButton(primary: boolean): CSSProperties {
  return { border: '1px solid var(--panel-border)', borderRadius: 999, padding: '9px 14px', background: primary ? 'var(--accent)' : 'var(--form-bg)', color: primary ? '#fff' : 'var(--text-primary)', fontWeight: 800, cursor: 'pointer' }
}

const dangerButton: CSSProperties = { border: '1px solid rgba(239,68,68,0.35)', borderRadius: 999, padding: '9px 14px', background: 'rgba(239,68,68,0.12)', color: 'var(--danger-text)', fontWeight: 800, cursor: 'pointer' }

const automationPanelHeadingText: CSSProperties = { fontWeight: 800, color: 'var(--task-title)' }
const automationSectionHeadingText: CSSProperties = { fontWeight: 750, color: 'var(--task-title)' }
const automationUpdatedText: CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-12)', fontWeight: 400, lineHeight: 1.35 }
const smallLabel: CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-12)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }
const automationRowGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'max-content 170px 120px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: '10px 12px', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', fontSize: 'var(--font-13)', minWidth: 0 }
const automationConnectionRowGrid: CSSProperties = { ...automationRowGrid, gridTemplateColumns: 'max-content 170px 140px minmax(0, 1fr) max-content' }
function automationStatusText(color: string): CSSProperties {
  return { color, fontSize: 'var(--font-12)', fontWeight: 300, background: 'transparent', lineHeight: 1.35, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }
}
const automationDateText: CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--font-12)', lineHeight: 1.35 }
const automationRoleText: CSSProperties = { color: 'var(--text-secondary)', fontWeight: 500, fontSize: 'var(--font-12)', lineHeight: 1.35, overflowWrap: 'anywhere', minWidth: 0 }
const automationCommentText: CSSProperties = { color: 'var(--text-primary)', overflowWrap: 'anywhere', lineHeight: 1.4, minWidth: 0 }
