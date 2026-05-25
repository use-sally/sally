'use client'

import { useState, type CSSProperties } from 'react'
import { AppShell } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { SamlSsoPanel } from '../../components/saml-sso-panel'
import { AutomationGovernancePanel } from '../../components/automation-governance-panel'
import { ApiMcpKeyPolicyPanel } from '../../components/api-mcp-key-policy-panel'

type SecurityIslandKey = 'authentication' | 'sessions' | 'saml' | 'automation' | 'two-factor' | 'api-keys' | 'audit-log'

type SecurityIsland = {
  key: SecurityIslandKey
  title: string
  description: string
  badge?: string
}

const securityIslands: SecurityIsland[] = [
  { key: 'authentication', title: 'Authentication policy', description: 'Local email/password authentication stays available in Community. Enterprise will add stricter password and identity-provider policies.' },
  { key: 'sessions', title: 'Sessions', description: 'View and manage basic session behavior. Enterprise policies will add forced re-authentication, maximum session lifetimes, and force-logout controls.' },
  { key: 'saml', title: 'SAML / SSO', description: 'Connect Sally to a company identity provider, configure IdP metadata, enable SSO, and optionally enforce SSO while keeping a break-glass superadmin account.', badge: 'Enterprise' },
  { key: 'automation', title: 'Automation governance', description: 'Control who can start agent workflows, allowed local runtimes, approval requirements, and workflow concurrency limits.', badge: 'Enterprise' },
  { key: 'two-factor', title: '2FA enforcement', description: 'Require 2FA for admins or all users, set grace periods, and reset recovery paths.', badge: 'Enterprise' },
  { key: 'api-keys', title: 'API & MCP key policy', description: 'Control API and MCP key creation, expiry, rotation, and admin-only restrictions.', badge: 'Enterprise' },
  { key: 'audit-log', title: 'Audit log', description: 'Search and export security-relevant activity such as role changes, membership changes, login events, and agent connections.', badge: 'Enterprise' },
]

const cardStyle = (active: boolean): CSSProperties => ({
  border: active ? '1px solid rgba(250, 204, 21, 0.55)' : '1px solid var(--panel-border)',
  borderRadius: 16,
  background: active ? 'rgba(250, 204, 21, 0.08)' : 'var(--panel-bg)',
  padding: 18,
  display: 'grid',
  gap: 8,
  textAlign: 'left',
  cursor: 'pointer',
  boxShadow: active ? '0 0 0 1px rgba(250, 204, 21, 0.12) inset' : 'none',
})

const modalBackdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(15, 23, 42, 0.58)' }
const modalPanel: CSSProperties = { width: 'min(920px, calc(100vw - 36px))', maxHeight: 'min(820px, calc(100vh - 36px))', overflow: 'hidden', border: '1px solid var(--panel-border)', borderRadius: 20, background: 'var(--form-bg)', color: 'var(--text-primary)', boxShadow: '0 28px 90px rgba(15,23,42,0.38)', display: 'flex', flexDirection: 'column' }
const modalCloseButton: CSSProperties = { border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 26, lineHeight: 1, padding: '0 4px' }

function SecurityIslandCard({ island, active, onOpen }: { island: SecurityIsland; active: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-pressed={active} style={cardStyle(active)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>{island.title}</h3>
        {island.badge ? <span style={{ border: '1px solid rgba(250,204,21,0.32)', borderRadius: 999, padding: '4px 8px', color: 'var(--task-title)', fontSize: 11, fontWeight: 700 }}>{island.badge}</span> : null}
      </div>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{island.description}</p>
      <span style={{ color: 'var(--task-title)', fontSize: 12, fontWeight: 750 }}>{active ? 'Modal open' : 'Open modal'} →</span>
    </button>
  )
}

function PlainIslandPanel({ title, description }: { title: string; description: string }) {
  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 20, display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>{title}</h2>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{description}</p>
      <div style={{ border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)', padding: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
        Configuration for this area will live here as it becomes editable. The card grid stays compact while this modal owns the detailed controls.
      </div>
    </section>
  )
}

function EnterprisePlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <EnterpriseLockedCard title={title} description={description}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>This policy area opens as its own modal so Enterprise controls do not expand the card grid.</div>
    </EnterpriseLockedCard>
  )
}

function ActiveIslandPanel({ activeKey }: { activeKey: SecurityIslandKey }) {
  const island = securityIslands.find((item) => item.key === activeKey) ?? securityIslands[0]
  if (activeKey === 'saml') return <SamlSsoPanel />
  if (activeKey === 'automation') return <AutomationGovernancePanel />
  if (activeKey === 'api-keys') return <ApiMcpKeyPolicyPanel />
  if (activeKey === 'two-factor' || activeKey === 'audit-log') return <EnterprisePlaceholderPanel title={island.title} description={island.description} />
  return <PlainIslandPanel title={island.title} description={island.description} />
}

function SecurityIslandModal({ islandKey, onClose }: { islandKey: SecurityIslandKey; onClose: () => void }) {
  const island = securityIslands.find((item) => item.key === islandKey) ?? securityIslands[0]
  return (
    <div role="presentation" style={modalBackdrop} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="security-island-title" style={modalPanel} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid var(--panel-border)', flex: '0 0 auto' }}>
          <div>
            <h2 id="security-island-title" style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>{island.title}</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{island.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close security policy modal" style={modalCloseButton}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', minHeight: 0 }}>
          <ActiveIslandPanel activeKey={islandKey} />
        </div>
      </div>
    </div>
  )
}

export default function SecurityPage() {
  const [activeIsland, setActiveIsland] = useState<SecurityIslandKey | null>(null)

  return (
    <AppShell title="Security" subtitle="Global authentication, identity, and compliance policy for this Sally instance.">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 20 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Global Security</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            Security is for instance-wide policy and compliance. Runtime diagnostics belong in System. Select a compact card to open its focused policy modal.
          </p>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {securityIslands.map((island) => <SecurityIslandCard key={island.key} island={island} active={activeIsland === island.key} onOpen={() => setActiveIsland(island.key)} />)}
        </div>
        {activeIsland ? <SecurityIslandModal islandKey={activeIsland} onClose={() => setActiveIsland(null)} /> : null}
      </div>
    </AppShell>
  )
}
