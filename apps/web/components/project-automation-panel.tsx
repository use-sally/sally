'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { createAgentPairingCode, resolveApprovalRequest, resolveBlocker, revokeAgentConnection, startProjectWorkflow, updateProjectAutomation } from '../lib/api'
import { qk, useProjectAutomationQuery } from '../lib/query'
import { AGENT_IDENTITY_EMPTY_STATE, buildHermesNpxConnectCommand, copyHermesConnectCommandToClipboard } from '../lib/project-automation-display'
import { panel, pill } from './app-shell'
import { useQueryClient } from '@tanstack/react-query'

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

function jobStatusTone(status: string) {
  if (status === 'QUEUED') return ['#fef3c7', '#92400e'] as const
  if (status === 'RUNNING' || status === 'CLAIMED') return ['#dbeafe', '#1d4ed8'] as const
  if (status === 'SUCCEEDED') return ['#dcfce7', '#166534'] as const
  if (status === 'FAILED' || status === 'TIMED_OUT') return ['#fee2e2', '#991b1b'] as const
  return ['var(--form-bg)', 'var(--text-secondary)'] as const
}

export function ProjectAutomationPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading, error, isFetching, dataUpdatedAt } = useProjectAutomationQuery(projectId)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [connectionInstructionsOpen, setConnectionInstructionsOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const config = data?.config ?? null
  const jobs = data?.jobs ?? []
  const runs = data?.runs ?? []
  const connections = (data?.connections ?? []).filter((connection) => !connection.revokedAt && connection.status !== 'REVOKED')
  const activeConnection = connections[0] ?? null
  const connectionToggleOn = Boolean(activeConnection) || Boolean(pairingCode)
  const blockers = data?.blockers ?? []
  const approvalRequests = data?.approvalRequests ?? []
  const pairingCommand = pairingCode ? buildHermesNpxConnectCommand({
    pairingCode: pairingCode.code,
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || undefined,
    workspaceId: process.env.NEXT_PUBLIC_WORKSPACE_ID || undefined,
    workspaceSlug: process.env.NEXT_PUBLIC_WORKSPACE_SLUG || undefined,
  }) : null
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: qk.projectAutomation(projectId) })
  }

  const showToast = (text: string) => {
    setToastMessage(text)
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setToastMessage(null), 3500)
    }
  }

  const savePatch = async (patch: Parameters<typeof updateProjectAutomation>[1]) => {
    setSaving(true)
    setMessage(null)
    setErrorMessage(null)
    try {
      await updateProjectAutomation(projectId, patch)
      await refresh()
      setMessage('Automation config saved.')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save automation config')
    } finally {
      setSaving(false)
    }
  }

  const handleStartWorkflow = async () => {
    setStarting(true)
    setMessage(null)
    setErrorMessage(null)
    try {
      const result = await startProjectWorkflow(projectId)
      await refresh()
      setMessage(`Queued audit and planning job ${result.job.id.slice(0, 8)}. Sally will create or update visible tasks before execution starts.`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start workflow')
    } finally {
      setStarting(false)
    }
  }

  const handleCreatePairingCode = async () => {
    setSaving(true)
    setMessage(null)
    setPairingCode(null)
    setConnectionInstructionsOpen(true)
    setErrorMessage(null)
    try {
      const result = await createAgentPairingCode({ name: 'Connected local worker', runtimeType: 'hermes', ttlMinutes: 10 })
      const command = buildHermesNpxConnectCommand({
        pairingCode: result.pairingCode,
        apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || undefined,
        workspaceId: process.env.NEXT_PUBLIC_WORKSPACE_ID || undefined,
        workspaceSlug: process.env.NEXT_PUBLIC_WORKSPACE_SLUG || undefined,
      })
      const copied = await copyHermesConnectCommandToClipboard(command, typeof navigator === 'undefined' ? null : navigator.clipboard)
      setPairingCode({ code: result.pairingCode, expiresAt: result.expiresAt })
      setMessage(copied
        ? 'Pairing code created. Run the copied connector command on the machine running the agent.'
        : 'Pairing code created. Copy the connector command below and run it on the machine running the agent.')
      showToast(copied ? 'Connector command copied to clipboard.' : 'Pairing code created. Copy the connector command below.')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create pairing code')
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeConnection = async (connectionId: string) => {
    setSaving(true)
    setErrorMessage(null)
    try {
      await revokeAgentConnection(connectionId)
      setPairingCode(null)
      setConnectionInstructionsOpen(false)
      await refresh()
      setMessage('Agent connection revoked.')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to revoke connection')
    } finally {
      setSaving(false)
    }
  }

  const handleConnectionToggle = async () => {
    if (activeConnection) {
      await handleRevokeConnection(activeConnection.id)
      return
    }
    if (pairingCode || connectionInstructionsOpen) {
      setPairingCode(null)
      setConnectionInstructionsOpen(false)
      setMessage(null)
      return
    }
    await handleCreatePairingCode()
  }

  const handleResolveApproval = async (approvalRequestId: string, status: 'APPROVED' | 'REJECTED') => {
    setSaving(true)
    setMessage(null)
    setErrorMessage(null)
    try {
      await resolveApprovalRequest(approvalRequestId, { status })
      await refresh()
      setMessage(status === 'APPROVED' ? 'Approval recorded. The worker will reconcile and queue the next PM step.' : 'Approval denied. The workflow will stop cleanly after reconciliation.')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to resolve approval')
    } finally {
      setSaving(false)
    }
  }

  const handleResolveBlocker = async (blockerId: string, status: 'RESOLVED' | 'CANCELLED') => {
    setSaving(true)
    setMessage(null)
    setErrorMessage(null)
    try {
      await resolveBlocker(blockerId, { status })
      await refresh()
      setMessage(status === 'RESOLVED' ? 'Blocker resolved. The worker will reconcile and queue the next PM step.' : 'Blocker cancelled. The workflow will stop cleanly after reconciliation.')
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
      {toastMessage ? <div role="status" aria-live="polite" style={toastStyle}>{toastMessage}</div> : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Agent automation</div>
            <span style={pill(isFetching ? '#dbeafe' : '#dcfce7', isFetching ? '#1d4ed8' : '#166534')}>{isFetching ? 'Syncing…' : 'Live'}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>One connected local agent runs a plan-first project workflow. Sally first audits the project and creates or updates visible tasks, then works from those cards. Auto-refreshes every 2s{dataUpdatedAt ? ` · updated ${formatTime(new Date(dataUpdatedAt).toISOString())}` : ''}.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button type="button" role="switch" aria-checked={connectionToggleOn} disabled={!canManage || saving} onClick={() => void handleConnectionToggle()} style={toggleButton(connectionToggleOn)}>
            <span style={toggleKnob(connectionToggleOn)} />
            <span>{connectionToggleOn ? 'Agent connected' : 'Agent disconnected'}</span>
          </button>
          <button type="button" disabled={!canManage || saving} onClick={() => void savePatch({ workflowEnabled: !(config?.workflowEnabled ?? false) })} style={primaryButton(config?.workflowEnabled ? false : true)}>{config?.workflowEnabled ? 'Disable automation' : 'Enable automation'}</button>
          <button type="button" disabled={!canManage || starting || !(config?.workflowEnabled ?? false)} onClick={() => void handleStartWorkflow()} style={primaryButton(true)}>{starting ? 'Starting…' : 'Start plan-first workflow'}</button>
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

      <div style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)', color: 'var(--text-muted)', fontSize: 13, display: 'grid', gap: 8 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 750 }}>Plan-first workflow model</div>
        <div>{AGENT_IDENTITY_EMPTY_STATE}</div>
        <div>First step: audit project → create or update visible tasks → execute from those cards.</div>
        <div>Internal modes: Planning → Building → Reviewing/Testing → Done or Waiting for approval/blocker.</div>
        <div>Live actions approval: {config?.liveActionsRequireApproval ?? true ? 'required' : 'not required'} · staging first: {config?.stagingFirst ?? true ? 'yes' : 'no'}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['plan first', 'visible task plan', 'single connected agent', 'approval gates stay visible'].map((capability) => <span key={capability} style={pill('var(--form-bg)', 'var(--text-secondary)')}>{capability}</span>)}
      </div>
      {message ? <div style={{ color: '#34d399', fontSize: 13 }}>{message}</div> : null}
      {connectionInstructionsOpen ? <div style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)', color: 'var(--text-primary)', display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 800 }}>Agent connection instructions</div>
        {pairingCode ? <>
          <div style={{ fontWeight: 700 }}>Pairing code: <code>{pairingCode.code}</code></div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Expires {formatTime(pairingCode.expiresAt)}. The worker token is shown only to the connecting agent and stored hashed in Sally.</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Run this on the machine where Hermes is installed. Hermes does not need to know Sally; this command installs/runs the Sally connector.</div>
          {pairingCommand ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid var(--panel-border)', borderRadius: 10, padding: 10, background: 'rgba(15,23,42,0.05)', color: 'var(--text-primary)', fontSize: 12 }}><code>{pairingCommand}</code></pre> : null}
        </> : <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{activeConnection ? 'Toggle off to revoke the connected agent.' : 'Toggle on to create a pairing code and copy the connector command.'}</div>}
      </div> : null}
      {errorMessage ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{errorMessage}</div> : null}

      {(blockers.length || approvalRequests.length) ? <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: 12, background: 'rgba(239,68,68,0.07)' }}>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Attention required</div>
        {approvalRequests.slice(0, 5).map((approval) => <div key={approval.id} style={{ display: 'grid', gap: 6, color: 'var(--text-primary)', fontSize: 13 }}>
          <div><span style={pill('#fef3c7', '#92400e')}>APPROVAL</span> <strong>{approval.type}</strong> · {approval.question}</div>
          {approval.recommendation ? <div style={{ color: 'var(--text-muted)' }}>{approval.recommendation}</div> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={!canManage || saving} onClick={() => void handleResolveApproval(approval.id, 'APPROVED')} style={primaryButton(true)}>Approve</button>
            <button type="button" disabled={!canManage || saving} onClick={() => void handleResolveApproval(approval.id, 'REJECTED')} style={dangerButton}>Deny</button>
          </div>
        </div>)}
        {blockers.slice(0, 5).map((blocker) => <div key={blocker.id} style={{ display: 'grid', gap: 6, color: 'var(--text-primary)', fontSize: 13 }}>
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
          <div style={{ fontWeight: 750, color: 'var(--text-primary)' }}>Connected agent</div>
          <button type="button" disabled={!canManage || saving} onClick={() => setConnectionInstructionsOpen((open) => !open)} style={primaryButton(false)}>{connectionInstructionsOpen ? 'Hide instructions' : 'Show instructions'}</button>
        </div>
        {connections.length ? (
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            {connections.slice(0, 8).map((connection) => {
              const tone = connection.status === 'ONLINE' ? ['#dcfce7', '#166534'] as const : connection.status === 'REVOKED' ? ['#fee2e2', '#991b1b'] as const : ['var(--form-bg)', 'var(--text-secondary)'] as const
              return <div key={connection.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', fontSize: 13, minWidth: 0 }}>
                <span style={pill(tone[0], tone[1])}>{connection.status}</span>
                <span style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere', minWidth: 0 }}>{connection.name} · {connection.runtimeType}{connection.profileRef ? ` · ${connection.profileRef}` : ''}</span>
                <span style={{ color: 'var(--text-muted)' }}>{formatTime(connection.lastSeenAt || connection.updatedAt)}</span>
                <button type="button" disabled={!canManage || saving || connection.status === 'REVOKED'} onClick={() => void handleRevokeConnection(connection.id)} style={primaryButton(false)}>Revoke</button>
              </div>
            })}
          </div>
        ) : <div style={{ color: 'var(--text-muted)' }}>No local agent connected yet.</div>}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 750, color: 'var(--text-primary)' }}>Recent workflow steps</div>
        {jobs.length ? (
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            {jobs.slice(0, 8).map((job) => {
              const tone = jobStatusTone(job.status)
              return <div key={job.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', fontSize: 13, minWidth: 0 }}>
                <span style={pill(tone[0], tone[1])}>{job.status}</span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{workflowModeLabel(job.role)}</span>
                <span style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere', minWidth: 0 }}>{job.mode} · {job.agent?.name || 'connected agent'} · step {job.workflowStep ?? '—'}/{job.maxSteps ?? '—'}</span>
                <span style={{ color: 'var(--text-muted)' }}>{formatTime(job.createdAt)}</span>
              </div>
            })}
          </div>
        ) : <div style={{ color: 'var(--text-muted)' }}>No automation jobs yet.</div>}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 750, color: 'var(--text-primary)' }}>Recent automation runs</div>
        {runs.length ? (
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            {runs.slice(0, 8).map((run) => {
              const tone = jobStatusTone(run.status)
              return <div key={run.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', fontSize: 13, minWidth: 0 }}>
                <span style={pill(tone[0], tone[1])}>{run.status}</span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{workflowModeLabel(run.role)}</span>
                <span style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere', minWidth: 0 }}>{run.summary || run.error || run.triggerType}</span>
                <span style={{ color: 'var(--text-muted)' }}>{formatTime(run.finishedAt || run.latestHeartbeatAt || run.startedAt || run.createdAt)}</span>
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

function toggleButton(on: boolean): CSSProperties {
  return { border: `1px solid ${on ? 'rgba(22,101,52,0.35)' : 'var(--panel-border)'}`, borderRadius: 999, padding: '5px 12px 5px 5px', background: on ? '#dcfce7' : 'var(--form-bg)', color: on ? '#166534' : 'var(--text-primary)', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }
}

function toggleKnob(on: boolean): CSSProperties {
  return { width: 30, height: 18, borderRadius: 999, background: on ? '#22c55e' : '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', padding: 2, boxSizing: 'border-box' }
}

const toastStyle: CSSProperties = { position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, border: '1px solid rgba(34,197,94,0.35)', borderRadius: 999, padding: '10px 14px', background: '#dcfce7', color: '#166534', fontWeight: 800, boxShadow: '0 12px 30px rgba(15,23,42,0.18)' }

const dangerButton: CSSProperties = { border: '1px solid rgba(239,68,68,0.35)', borderRadius: 999, padding: '9px 14px', background: 'rgba(239,68,68,0.12)', color: 'var(--danger-text)', fontWeight: 800, cursor: 'pointer' }

const smallLabel: CSSProperties = { color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }
