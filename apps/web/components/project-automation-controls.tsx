'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createAgentPairingCode, revokeAgentConnection, startProjectWorkflow, updateProjectAutomation } from '../lib/api'
import { buildHermesNpxConnectCommand, copyHermesConnectCommandToClipboard } from '../lib/project-automation-display'
import { qk, useProjectAutomationQuery } from '../lib/query'
import { pill } from './app-shell'

function formatTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—'
}

export function ProjectAutomationControls({ projectId, canManage, compact = false }: { projectId: string; canManage: boolean; compact?: boolean }) {
  const qc = useQueryClient()
  const { data } = useProjectAutomationQuery(projectId)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [connectionInstructionsOpen, setConnectionInstructionsOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const config = data?.config ?? null
  const connections = (data?.connections ?? []).filter((connection) => !connection.revokedAt && connection.status !== 'REVOKED')
  const activeConnection = connections[0] ?? null
  const connectionToggleOn = Boolean(activeConnection) || Boolean(pairingCode)
  const workflowEnabled = config?.workflowEnabled ?? false
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

  const handleAutomationToggle = async () => {
    if (!canManage || saving) return
    setSaving(true)
    setMessage(null)
    setErrorMessage(null)
    try {
      await updateProjectAutomation(projectId, { workflowEnabled: !workflowEnabled })
      await refresh()
      setMessage(!workflowEnabled ? 'Automation enabled.' : 'Automation disabled.')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update automation')
    } finally {
      setSaving(false)
    }
  }

  const handleStartWorkflow = async () => {
    if (!canManage || starting || !workflowEnabled) return
    setStarting(true)
    setMessage(null)
    setErrorMessage(null)
    try {
      const result = await startProjectWorkflow(projectId)
      await refresh()
      setMessage(`Queued audit/planning job ${result.job.id.slice(0, 8)}. Sally will create or update visible tasks before execution.`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start workflow')
    } finally {
      setStarting(false)
    }
  }

  const handleCreatePairingCode = async () => {
    if (!canManage || saving) return
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

  const handleRevokeConnection = async () => {
    if (!canManage || saving) return
    if (!activeConnection) {
      if (pairingCode || connectionInstructionsOpen) {
        setPairingCode(null)
        setConnectionInstructionsOpen(false)
        setMessage(null)
        return
      }
      await handleCreatePairingCode()
      return
    }

    setSaving(true)
    setErrorMessage(null)
    try {
      await revokeAgentConnection(activeConnection.id)
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

  return (
    <div style={{ display: 'grid', gap: compact ? 6 : 8, justifyItems: compact ? 'end' : 'stretch', minWidth: 0 }}>
      {toastMessage ? <div role="status" aria-live="polite" style={toastStyle}>{toastMessage}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: compact ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
        <button type="button" role="switch" aria-checked={workflowEnabled} disabled={!canManage || saving} onClick={() => void handleAutomationToggle()} style={toggleButton(workflowEnabled)}>
          <span style={toggleKnob(workflowEnabled)} />
          <span>{workflowEnabled ? 'Automation enabled' : 'Automation disabled'}</span>
        </button>
        <button type="button" role="switch" aria-checked={connectionToggleOn} disabled={!canManage || saving} onClick={() => void handleRevokeConnection()} style={toggleButton(connectionToggleOn)}>
          <span style={toggleKnob(connectionToggleOn)} />
          <span>{connectionToggleOn ? 'Agent connected' : 'Agent disconnected'}</span>
        </button>
        <button type="button" disabled={!canManage || starting || !workflowEnabled} onClick={() => void handleStartWorkflow()} style={primaryButton(true)}>{starting ? 'Starting…' : 'Plan & start workflow'}</button>
      </div>
      {message ? <div style={{ color: '#34d399', fontSize: 12, textAlign: compact ? 'right' : 'left' }}>{message}</div> : null}
      {errorMessage ? <div style={{ color: 'var(--danger-text)', fontSize: 12, textAlign: compact ? 'right' : 'left' }}>{errorMessage}</div> : null}
      {connectionInstructionsOpen ? <div style={connectionBox}>
        <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Agent connection instructions</div>
        {pairingCode ? <>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Pairing code: <code>{pairingCode.code}</code></div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Expires {formatTime(pairingCode.expiresAt)}. Run this where Hermes is installed.</div>
          {pairingCommand ? <pre style={commandBlock}><code>{pairingCommand}</code></pre> : null}
        </> : <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{activeConnection ? 'Toggle off to revoke the connected agent.' : 'Toggle on to create a pairing code and copy the connector command.'}</div>}
      </div> : null}
      {!canManage ? <div style={{ justifySelf: compact ? 'end' : 'start' }}><span style={pill('var(--form-bg)', 'var(--text-secondary)')}>read-only</span></div> : null}
    </div>
  )
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
const connectionBox: CSSProperties = { justifySelf: 'stretch', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)', color: 'var(--text-primary)', display: 'grid', gap: 8, maxWidth: 720, minWidth: 0 }
const commandBlock: CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid var(--panel-border)', borderRadius: 10, padding: 10, background: 'rgba(15,23,42,0.05)', color: 'var(--text-primary)', fontSize: 12 }
