import { AppShell } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { SamlSsoPanel } from '../../components/saml-sso-panel'
import { AutomationGovernancePanel } from '../../components/automation-governance-panel'

const availableCards = [
  ['Authentication policy', 'Local email/password authentication stays available in Community. Enterprise will add stricter password and identity-provider policies.'],
  ['Sessions', 'View and manage basic session behavior. Enterprise policies will add forced re-authentication, maximum session lifetimes, and force-logout controls.'],
]

const samlSsoTitle = 'SAML / SSO'

const enterpriseCards = [
  ['2FA enforcement', 'Require 2FA for admins or all users, set grace periods, and reset recovery paths.'],
  ['API & MCP key policy', 'Control API and MCP key creation, expiry, rotation, and admin-only restrictions.'],
  ['Audit log', 'Search and export security-relevant activity such as role changes, membership changes, login events, and agent connections.'],
]

function PlainCard({ title, description }: { title: string; description: string }) {
  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 16 }}>{title}</h3>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{description}</p>
    </section>
  )
}

export default function SecurityPage() {
  return (
    <AppShell title="Security" subtitle="Global authentication, identity, and compliance policy for this Sally instance.">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 20 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Global Security</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            Security is for instance-wide policy and compliance. Runtime diagnostics belong in System.
          </p>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {availableCards.map(([title, description]) => <PlainCard key={title} title={title} description={description} />)}
          <SamlSsoPanel key={samlSsoTitle} />
          <AutomationGovernancePanel />
          {enterpriseCards.map(([title, description]) => <EnterpriseLockedCard key={title} title={title} description={description} />)}
        </div>
      </div>
    </AppShell>
  )
}
