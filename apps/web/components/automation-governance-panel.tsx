'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getAutomationGovernancePolicy, getEdition, saveAutomationGovernancePolicy } from '../lib/api'
import { hasFeature, type EditionInfo } from '../lib/edition'
import { EnterpriseLockedCard } from './enterprise-locked-card'

const inputStyle = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--text-primary)' }
const labelStyle = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }
const runtimeOptions = ['hermes', 'codex', 'pi', 'openclaw', 'claude-code', 'opencode']

function toggle(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
}

export function AutomationGovernancePanel() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [allowedRuntimeTypes, setAllowedRuntimeTypes] = useState<string[]>([])
  const [workflowStartRoles, setWorkflowStartRoles] = useState<string[]>(['OWNER', 'MEMBER'])
  const [maxConcurrentWorkflowJobs, setMaxConcurrentWorkflowJobs] = useState(1)
  const [workflowStartRequiresApproval, setWorkflowStartRequiresApproval] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const enabled = hasFeature(edition, 'automation.workflowPolicies')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await getEdition()
      setEdition(info)
      if (!hasFeature(info, 'automation.workflowPolicies')) return
      const result = await getAutomationGovernancePolicy()
      setAllowedRuntimeTypes(result.policy.allowedRuntimeTypes)
      setWorkflowStartRoles(result.policy.workflowStartRoles)
      setMaxConcurrentWorkflowJobs(result.policy.maxConcurrentWorkflowJobs)
      setWorkflowStartRequiresApproval(result.policy.workflowStartRequiresApproval)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automation policy')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      await saveAutomationGovernancePolicy({ allowedRuntimeTypes, workflowStartRoles, maxConcurrentWorkflowJobs, workflowStartRequiresApproval })
      setNotice('Automation governance policy saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save automation policy')
    } finally {
      setWorking(false)
    }
  }

  if (!loading && !enabled) {
    return (
      <EnterpriseLockedCard title="Automation governance" description="Control who can start agent workflows, allowed local runtimes, approval requirements, and workflow concurrency limits.">
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Visible in Community; editable in Enterprise.</div>
      </EnterpriseLockedCard>
    )
  }

  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>Automation governance</h3>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>Enterprise controls for agent workflow start, allowed runtimes, and concurrency.</p>
      </div>
      {error ? <div style={{ border: '1px solid rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)', color: '#fecaca', borderRadius: 12, padding: 12 }}>{error}</div> : null}
      {notice ? <div style={{ border: '1px solid rgba(110,231,183,0.35)', background: 'rgba(16,185,129,0.08)', color: '#bbf7d0', borderRadius: 12, padding: 12 }}>{notice}</div> : null}
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div style={labelStyle}>
          Allowed agent runtimes
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {runtimeOptions.map((runtime) => (
              <label key={runtime} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid var(--panel-border)', borderRadius: 999, padding: '6px 10px' }}>
                <input type="checkbox" checked={allowedRuntimeTypes.includes(runtime)} onChange={() => setAllowedRuntimeTypes((current) => toggle(current, runtime))} /> {runtime}
              </label>
            ))}
          </div>
          <span style={{ color: 'var(--text-muted)' }}>Leave all unchecked to allow every supported runtime.</span>
        </div>
        <div style={labelStyle}>
          Who may start workflows
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['OWNER', 'MEMBER'].map((role) => (
              <label key={role} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid var(--panel-border)', borderRadius: 999, padding: '6px 10px' }}>
                <input type="checkbox" checked={workflowStartRoles.includes(role)} onChange={() => setWorkflowStartRoles((current) => toggle(current, role))} /> {role.toLowerCase()}
              </label>
            ))}
          </div>
        </div>
        <label style={labelStyle}>Max concurrent workflow jobs per project<input type="number" min={1} max={20} value={maxConcurrentWorkflowJobs} onChange={(event) => setMaxConcurrentWorkflowJobs(Number(event.target.value))} style={inputStyle} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={workflowStartRequiresApproval} onChange={(event) => setWorkflowStartRequiresApproval(event.target.checked)} /> Require approval before workflow starts</label>
        <button type="submit" disabled={working || loading} style={{ justifySelf: 'start', border: '1px solid rgba(250,204,21,0.45)', background: '#fcd34d', color: '#052e16', borderRadius: 12, padding: '10px 14px', fontWeight: 750, opacity: working || loading ? 0.5 : 1 }}>Save automation policy</button>
      </form>
    </section>
  )
}
