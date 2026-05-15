'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createAgentPairingCode, revokeAgentConnection, startProjectWorkflow, updateProjectAutomation } from '../lib/api'
import { AGENT_RUNTIME_OPTIONS, getAgentRuntimeOption, type AgentRuntimeId } from '../lib/agent-runtimes'
import { buildAgentNpxConnectCommand, copyAgentConnectCommandToClipboard } from '../lib/project-automation-display'
import { qk, useProjectAutomationQuery } from '../lib/query'
import { pill } from './app-shell'

type AutomationToast = { kind: 'message'; text: string }
type AgentConnectorModalState = { pairingCode: string; pairingCommand: string; foregroundCommand: string; copied: boolean; expiresAt: string; runtime: AgentRuntimeId }

type WorkflowControlState = { label: string; active: boolean }

function hasRunningWorkflowWork({ jobs, runs }: { jobs: any[]; runs: any[] }) {
  return jobs.some((job) => job.status === 'QUEUED' || job.status === 'CLAIMED' || job.status === 'RUNNING') || runs.some((run) => run.status === 'QUEUED' || run.status === 'RUNNING')
}

function workflowModeLabel(role: string | null | undefined) {
  const normalized = role?.toLowerCase()
  if (normalized === 'pm') return 'Planning'
  if (normalized === 'architect') return 'Designing'
  if (normalized === 'coder') return 'Building'
  if (normalized === 'reviewer') return 'Reviewing'
  if (normalized === 'tester') return 'Testing'
  if (normalized === 'infra') return 'Deploying'
  return normalized || 'Workflow'
}

function getWorkflowControlState({ jobs, runs, blockers, approvalRequests, activeConnection, workflowEnabled, starting }: { jobs: any[]; runs: any[]; blockers: any[]; approvalRequests: any[]; activeConnection: any; workflowEnabled: boolean; starting: boolean }): WorkflowControlState {
  if (starting) return { label: 'Starting workflow…', active: true }
  if (!activeConnection) return { label: 'Connect agent first', active: false }
  if (approvalRequests.some((approval) => approval.status === 'PENDING')) return { label: 'Waiting for approval', active: true }
  if (blockers.some((blocker) => blocker.status === 'OPEN')) return { label: 'Waiting on blocker', active: true }

  const activeJob = jobs.find((job) => job.status === 'RUNNING' || job.status === 'CLAIMED')
  if (activeJob) return { label: `Running: ${workflowModeLabel(activeJob.role)}`, active: true }

  const activeRun = runs.find((run) => run.status === 'RUNNING' || run.status === 'CLAIMED')
  if (activeRun) return { label: `Running: ${workflowModeLabel(activeRun.role)}`, active: true }

  const queuedJob = jobs.find((job) => job.status === 'QUEUED')
  if (queuedJob) return { label: `Queued: ${workflowModeLabel(queuedJob.role)}`, active: true }

  const latestFailed = jobs.find((job) => job.status === 'FAILED' || job.status === 'TIMED_OUT')
  if (latestFailed) return { label: 'Last workflow failed', active: false }

  return { label: workflowEnabled ? 'Ready: workflow enabled' : 'Ready to plan', active: workflowEnabled }
}

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—'
}

export function ProjectAutomationControls({ projectId, canManage, compact = false }: { projectId: string; canManage: boolean; compact?: boolean }) {
  const qc = useQueryClient()
  const { data } = useProjectAutomationQuery(projectId)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [toast, setToast] = useState<AutomationToast | null>(null)
  const [connectorModal, setConnectorModal] = useState<AgentConnectorModalState | null>(null)
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)
  const [agentPrerequisiteHighlight, setAgentPrerequisiteHighlight] = useState(false)
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [selectedRuntime, setSelectedRuntime] = useState<AgentRuntimeId>('hermes')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const config = data?.config ?? null
  const connections = (data?.connections ?? []).filter((connection) => !connection.revokedAt && connection.status !== 'REVOKED')
  const activeConnection = connections[0] ?? null
  const pendingPairing = Boolean(pairingCode)
  const connectionToggleOn = Boolean(activeConnection)
  const workflowEnabled = config?.workflowEnabled ?? false
  const jobs = data?.jobs ?? []
  const runs = data?.runs ?? []
  const blockers = data?.blockers ?? []
  const approvalRequests = data?.approvalRequests ?? []
  const workflowControl = getWorkflowControlState({ jobs, runs, blockers, approvalRequests, activeConnection, workflowEnabled, starting })
  const hasActiveWorkflowWork = hasRunningWorkflowWork({ jobs, runs })

  useEffect(() => {
    if (activeConnection && connectorModal) {
      setConnectorModal(null)
      setPairingCode(null)
    }
  }, [activeConnection, connectorModal])

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: qk.projectAutomation(projectId) })
  }

  const showToast = (nextToast: AutomationToast) => {
    setToast(nextToast)
    if (nextToast.kind === 'message' && typeof window !== 'undefined') {
      window.setTimeout(() => {
        setToast(null)
        setAgentPrerequisiteHighlight(false)
      }, 3500)
    }
  }

  const handleStartWorkflow = async () => {
    if (!canManage || saving || starting) return
    if (!activeConnection) {
      showToast({ kind: 'message', text: 'Connect agent first.' })
      setAgentPrerequisiteHighlight(true)
      return
    }
    setStarting(true)
    setErrorMessage(null)
    try {
      if (!workflowEnabled) {
        await updateProjectAutomation(projectId, { workflowEnabled: true })
      }
      const result = await startProjectWorkflow(projectId)
      await refresh()
      showToast({ kind: 'message', text: `Queued audit/planning job ${result.job.id.slice(0, 8)}. Sally will create or update visible tasks before execution.` })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start workflow')
    } finally {
      setStarting(false)
    }
  }

  const handleCreatePairingCode = async () => {
    if (!canManage || saving) return
    setSaving(true)
    setPairingCode(null)
    setErrorMessage(null)
    try {
      const runtime = getAgentRuntimeOption(selectedRuntime)
      const result = await createAgentPairingCode({ name: `${runtime.label} local worker`, runtimeType: runtime.id, ttlMinutes: 10 })
      const commandInput = {
        runtime: runtime.id,
        pairingCode: result.pairingCode,
        apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || undefined,
        workspaceId: process.env.NEXT_PUBLIC_WORKSPACE_ID || undefined,
        workspaceSlug: process.env.NEXT_PUBLIC_WORKSPACE_SLUG || undefined,
      }
      const command = buildAgentNpxConnectCommand({ ...commandInput, background: true })
      const foregroundCommand = buildAgentNpxConnectCommand(commandInput)
      const copied = await copyAgentConnectCommandToClipboard(command, typeof navigator === 'undefined' ? null : navigator.clipboard)
      setPairingCode({ code: result.pairingCode, expiresAt: result.expiresAt })
      setConnectorModal({
        pairingCode: result.pairingCode,
        pairingCommand: command,
        foregroundCommand,
        copied,
        expiresAt: result.expiresAt,
        runtime: runtime.id,
      })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create pairing code')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnectConfirmed = async () => {
    if (!canManage || saving || !activeConnection) return
    setSaving(true)
    setErrorMessage(null)
    try {
      const result = await revokeAgentConnection(activeConnection.id, { clearQueue: true })
      setDisconnectModalOpen(false)
      setPairingCode(null)
      setConnectorModal(null)
      setToast(null)
      await refresh()
      const cleared = (result.cancelledJobs ?? 0) + (result.cancelledRuns ?? 0)
      showToast({ kind: 'message', text: cleared > 0 ? `Agent disconnected. Cleared ${cleared} queued or running workflow item${cleared === 1 ? '' : 's'}.` : 'Agent disconnected. Workflow queue is clear.' })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to revoke connection')
    } finally {
      setSaving(false)
    }
  }

  const handleRevokeConnection = async () => {
    if (!canManage || saving) return
    if (!activeConnection) {
      if (pairingCode) {
        setPairingCode(null)
        setConnectorModal(null)
        setToast(null)
        return
      }
      await handleCreatePairingCode()
      return
    }

    setDisconnectModalOpen(true)
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 6 : 8, justifyItems: compact ? 'end' : 'stretch', minWidth: 0 }}>
      {toast ? <AutomationToastView toast={toast} /> : null}
      {connectorModal ? <AgentConnectorModal modal={connectorModal} onClose={() => setConnectorModal(null)} /> : null}
      {disconnectModalOpen && activeConnection ? <AgentDisconnectModal hasActiveWorkflowWork={hasActiveWorkflowWork} saving={saving} onCancel={() => setDisconnectModalOpen(false)} onConfirm={() => void handleDisconnectConfirmed()} /> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: compact ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
        {!activeConnection && !pendingPairing ? <AgentRuntimePicker value={selectedRuntime} disabled={!canManage || saving} onChange={setSelectedRuntime} /> : null}
        <button type="button" role="switch" aria-checked={connectionToggleOn} disabled={!canManage || saving} onClick={() => void handleRevokeConnection()} style={automationIslandControlStyle(connectionToggleOn, agentPrerequisiteHighlight)}>
          {activeConnection ? `${getAgentRuntimeOption(activeConnection.runtimeType).label} connected` : pendingPairing ? `${getAgentRuntimeOption(selectedRuntime).label} pairing pending` : `Connect ${getAgentRuntimeOption(selectedRuntime).label}`}
        </button>
        <button type="button" disabled={!canManage || starting || saving} onClick={() => void handleStartWorkflow()} style={automationIslandControlStyle(workflowControl.active)}>{workflowControl.label}</button>
      </div>
      {errorMessage ? <div style={{ color: 'var(--danger-text)', fontSize: 12, textAlign: compact ? 'right' : 'left' }}>{errorMessage}</div> : null}
      {!canManage ? <div style={{ justifySelf: compact ? 'end' : 'start' }}><span style={pill('var(--form-bg)', 'var(--text-secondary)')}>read-only</span></div> : null}
    </div>
  )
}

function AgentRuntimePicker({ value, disabled, onChange }: { value: AgentRuntimeId; disabled: boolean; onChange: (runtime: AgentRuntimeId) => void }) {
  return (
    <select aria-label="Agent runtime" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as AgentRuntimeId)} style={runtimePickerStyle}>
      {AGENT_RUNTIME_OPTIONS.map((runtime) => <option key={runtime.id} value={runtime.id}>{runtime.label}</option>)}
    </select>
  )
}

function AutomationToastView({ toast }: { toast: AutomationToast }) {
  return <div role="status" aria-live="polite" style={toastStyle}>{toast.text}</div>
}

function AgentConnectorModal({ modal, onClose }: { modal: AgentConnectorModalState; onClose: () => void }) {
  return (
    <div data-agent-connector-modal="true" style={modalBackdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="agent-connector-title" style={modalPanel}>
        <button type="button" aria-label="Close agent connector modal" onClick={onClose} style={modalCloseButton}>×</button>
        <div style={{ display: 'grid', gap: 10 }}>
          <div id="agent-connector-title" style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 18 }}>{getAgentRuntimeOption(modal.runtime).label} connection instructions</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {modal.copied ? 'Background connector command copied to clipboard.' : `Copy this connector command and run it where ${getAgentRuntimeOption(modal.runtime).label} is installed.`}
          </div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Pairing code: <code>{modal.pairingCode}</code></div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Expires {formatTime(modal.expiresAt)}. The default command starts a detached runner and writes pid/log files under <code>~/.sally</code>.</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>Background runner</div>
          <pre style={modalCommandBlock}><code>{modal.pairingCommand}</code></pre>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Debug/foreground mode:</div>
          <pre style={modalCommandBlock}><code>{modal.foregroundCommand}</code></pre>
        </div>
      </div>
    </div>
  )
}

function AgentDisconnectModal({ hasActiveWorkflowWork, saving, onCancel, onConfirm }: { hasActiveWorkflowWork: boolean; saving: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div data-agent-disconnect-modal="true" style={modalBackdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="agent-disconnect-title" style={modalPanel}>
        <button type="button" aria-label="Close disconnect modal" onClick={onCancel} style={modalCloseButton}>×</button>
        <div style={{ display: 'grid', gap: 12 }}>
          <div id="agent-disconnect-title" style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 18 }}>Disconnect agent and clear queue?</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Disconnecting the agent removes this runtime from Sally and clears workflow work so no stale automation continues against the project.</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13, display: 'grid', gap: 6 }}>
            <li>Queued workflow jobs will be cancelled.</li>
            <li>Running workflow work will be marked cancelled.</li>
            <li>The agent can be connected again later with a new pairing code.</li>
          </ul>
          {hasActiveWorkflowWork ? <div style={{ border: '1px solid rgba(239,68,68,0.28)', borderRadius: 12, padding: 10, background: 'rgba(239,68,68,0.08)', color: 'var(--danger-text)', fontSize: 13 }}>Active workflow work is present. Disconnecting will stop Sally from continuing the queued/running workflow.</div> : <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No queued or running workflow work is currently visible.</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={onCancel} disabled={saving} style={secondaryModalButton}>Cancel</button>
            <button type="button" onClick={onConfirm} disabled={saving} style={dangerModalButton}>{saving ? 'Disconnecting…' : 'Disconnect and clear queue'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function automationIslandControlStyle(active: boolean, danger = false): CSSProperties {
  return {
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: 12,
    fontWeight: 400,
    background: active ? 'rgba(16, 185, 129, 0.10)' : 'var(--form-bg)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    border: danger ? '1px solid var(--danger-text)' : active ? '1px solid var(--form-border-focus)' : '1px solid var(--form-border)',
    boxShadow: danger ? '0 0 0 3px rgba(239, 68, 68, 0.18), 0 10px 24px rgba(239, 68, 68, 0.18)' : undefined,
    cursor: 'pointer',
  }
}


const runtimePickerStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid var(--form-border)',
  background: 'var(--form-bg)',
  color: 'var(--text-secondary)',
  fontSize: 14,
  fontWeight: 400,
}

const toastStyle: CSSProperties = { position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, border: '1px solid rgba(34,197,94,0.35)', borderRadius: 999, padding: '10px 14px', background: '#dcfce7', color: '#166534', fontWeight: 800, boxShadow: '0 12px 30px rgba(15,23,42,0.18)' }
const modalBackdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(15, 23, 42, 0.52)' }
const modalPanel: CSSProperties = { position: 'relative', width: 'min(720px, calc(100vw - 36px))', maxHeight: 'min(720px, calc(100vh - 36px))', overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: 18, padding: '22px 48px 22px 22px', background: 'var(--panel-bg)', color: 'var(--text-primary)', boxShadow: '0 28px 80px rgba(15,23,42,0.34)' }
const modalCloseButton: CSSProperties = { position: 'absolute', top: 12, right: 14, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 24, lineHeight: 1 }
const modalCommandBlock: CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'rgba(15,23,42,0.05)', color: 'var(--text-primary)', fontSize: 12 }
const secondaryModalButton: CSSProperties = { border: '1px solid var(--form-border)', borderRadius: 12, padding: '10px 14px', background: 'var(--form-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }
const dangerModalButton: CSSProperties = { border: '1px solid rgba(239,68,68,0.42)', borderRadius: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.12)', color: 'var(--danger-text)', cursor: 'pointer', fontWeight: 700 }
