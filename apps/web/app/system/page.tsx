import { AppShell } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { SystemCloudStorageCard } from '../../components/system-cloud-storage-card'
import { appBuildTime, appVersionLabel } from '../../lib/version'

const runtimeCards = [
  ['Version', `Sally ${appVersionLabel()}${appBuildTime ? ` built ${appBuildTime}` : ''}`],
  ['Email/SMTP status', 'Shows whether outbound email is configured without exposing SMTP secrets.'],
  ['Storage status', 'Shows upload/storage readiness and keeps paths and credentials redacted.'],
  ['Migration status', 'Shows whether database migrations are current for this installation.'],
  ['Background jobs', 'Shows worker, automation, and agent connector health at a safe summary level.'],
  ['Redacted deployment diagnostics', 'Displays operational checks with environment values redacted by default.'],
]

function SystemCard({ title, description }: { title: string; description: string }) {
  return (
    <section style={{ border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--panel-bg)', padding: 18, display: 'grid', gap: 8 }}>
      <h3 style={{ margin: 0, color: 'var(--heading-text)', fontSize: 'var(--font-16)' }}>{title}</h3>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.55 }}>{description}</p>
    </section>
  )
}

export default function SystemPage() {
  return (
    <AppShell title="System" subtitle="Runtime health, installation state, and safe diagnostics for this Sally instance.">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ border: '1px solid var(--panel-border)', borderRadius: 18, background: 'var(--panel-bg)', padding: 20 }}>
          <h2 style={{ margin: 0, color: 'var(--heading-text)', fontSize: 'var(--font-18)' }}>Global System</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.6 }}>
            System is for runtime and installation health. Security policy belongs in Security.
          </p>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {runtimeCards.map(([title, description]) => <SystemCard key={title} title={title} description={description} />)}
          <SystemCloudStorageCard />
          <EnterpriseLockedCard title="Backups/restore" description="Manage backup schedules, restore workflows, and retention controls from the Sally admin UI." />
        </div>
      </div>
    </AppShell>
  )
}
