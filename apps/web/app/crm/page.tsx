'use client'

import { FormEvent, useEffect, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { AppShell, panel } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { createCrmDeal, createCrmOrganization, createCrmPerson, getCrmStatus, getEdition, listCrmDeals, listCrmOrganizations, listCrmPeople, type CrmDeal, type CrmOrganization, type CrmPerson } from '../../lib/api'
import { hasFeature, type EditionInfo } from '../../lib/edition'

type CrmModal = 'organizations' | 'people' | 'deals' | null

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ width: '100%', border: '1px solid var(--panel-border)', borderRadius: 10, background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: 'var(--font-14)', ...props.style }} />
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ ...panel, display: 'grid', gap: 12 }}><div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>{children}</div>
}

function ModalCard({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={modalBackdrop} onMouseDown={onClose}>
      <div style={modalCard} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" style={modalCloseButton}>×</button>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-24)', fontWeight: 850, letterSpacing: '-0.03em' }}>{title}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.5 }}>{subtitle}</div>
        </div>
        {children}
      </div>
    </div>
  )
}

const textButton: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  padding: 0,
  fontSize: 'var(--font-13)',
  fontWeight: 800,
  cursor: 'pointer',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const crmNavButton: CSSProperties = {
  ...textButton,
  width: '100%',
  padding: '10px 0',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-15)',
}

const modalBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'rgba(2, 6, 23, 0.68)',
  backdropFilter: 'blur(8px)',
}

const modalCard: CSSProperties = {
  position: 'relative',
  width: 'min(880px, 100%)',
  maxHeight: 'min(760px, calc(100vh - 48px))',
  overflow: 'auto',
  border: '1px solid var(--panel-border)',
  borderRadius: 24,
  background: 'var(--panel-bg)',
  boxShadow: 'var(--panel-shadow)',
  padding: 24,
  display: 'grid',
  gap: 18,
}

const modalCloseButton: CSSProperties = { position: 'absolute', top: 14, right: 16, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--font-26)', lineHeight: 1, padding: '0 4px' }
const itemRow: CSSProperties = { borderTop: '1px solid var(--panel-border)', paddingTop: 10, color: 'var(--text-secondary)', fontSize: 'var(--font-14)', lineHeight: 1.5 }

export default function CrmPage() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [organizations, setOrganizations] = useState<CrmOrganization[]>([])
  const [people, setPeople] = useState<CrmPerson[]>([])
  const [deals, setDeals] = useState<CrmDeal[]>([])
  const [activeModal, setActiveModal] = useState<CrmModal>(null)
  const [orgName, setOrgName] = useState('')
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [dealTitle, setDealTitle] = useState('')

  async function loadCrm() {
    const [crmStatus, orgs, crmPeople, crmDeals] = await Promise.all([getCrmStatus(), listCrmOrganizations(), listCrmPeople(), listCrmDeals()])
    setStatus(crmStatus.message)
    setOrganizations(orgs.items)
    setPeople(crmPeople.items)
    setDeals(crmDeals.items)
  }

  useEffect(() => {
    let cancelled = false
    getEdition()
      .then(async (info) => {
        if (cancelled) return
        setEdition(info)
        if (hasFeature(info, 'crm.core')) await loadCrm()
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load CRM') })
    return () => { cancelled = true }
  }, [])

  const enabled = hasFeature(edition, 'crm.core')

  async function submitOrg(event: FormEvent) {
    event.preventDefault(); setError(null)
    if (!orgName.trim()) return
    await createCrmOrganization({ name: orgName.trim() })
    setOrgName('')
    await loadCrm()
  }

  async function submitPerson(event: FormEvent) {
    event.preventDefault(); setError(null)
    if (!personName.trim()) return
    await createCrmPerson({ name: personName.trim(), email: personEmail.trim() || undefined, organizationId: organizations[0]?.id || null })
    setPersonName(''); setPersonEmail('')
    await loadCrm()
  }

  async function submitDeal(event: FormEvent) {
    event.preventDefault(); setError(null)
    if (!dealTitle.trim()) return
    await createCrmDeal({ title: dealTitle.trim(), organizationId: organizations[0]?.id || null, status: 'OPEN' })
    setDealTitle('')
    await loadCrm()
  }

  return (
    <AppShell title="CRM" subtitle="A separate Sally surface for relationships, deals, and agent-ready customer context.">
      {!enabled ? (
        <EnterpriseLockedCard title="Sally CRM add-on" description="Organizations, people, deals, and activities are an optional Sally add-on designed to be API/MCP-first." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <aside style={{ ...panel, display: 'grid', gap: 8, position: 'sticky', top: 24 }}>
            <div style={{ color: 'rgba(250, 204, 21, 0.82)', fontSize: 'var(--font-11)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>CRM</div>
            <button type="button" onClick={() => setActiveModal('organizations')} style={crmNavButton}>Organizations</button>
            <button type="button" onClick={() => setActiveModal('people')} style={crmNavButton}>People</button>
            <button type="button" onClick={() => setActiveModal('deals')} style={crmNavButton}>Deals</button>
          </aside>

          <div style={{ display: 'grid', gap: 16 }}>
            <Section title="CRM workflow">
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-14)', lineHeight: 1.6 }}>{status || 'Loading CRM…'} Start with a person or organization, then open deals when there is an opportunity.</p>
              {error ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{error}</div> : null}
            </Section>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <Section title="Organizations"><div style={{ color: 'var(--text-secondary)' }}>{organizations.length} records</div></Section>
              <Section title="People"><div style={{ color: 'var(--text-secondary)' }}>{people.length} records</div></Section>
              <Section title="Deals"><div style={{ color: 'var(--text-secondary)' }}>{deals.length} records</div></Section>
            </div>
          </div>

          {activeModal === 'organizations' ? (
            <ModalCard title="Organizations" subtitle="Companies, customers, vendors, and accounts." onClose={() => setActiveModal(null)}>
              <form onSubmit={submitOrg} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="New organization" /><button type="submit" style={textButton}>Add</button></form>
              <div style={{ display: 'grid', gap: 10 }}>{organizations.map((org) => <div key={org.id} style={itemRow}><strong style={{ color: 'var(--text-primary)' }}>{org.name}</strong> <span style={{ opacity: .65 }}>({org._count?.people ?? 0} people, {org._count?.deals ?? 0} deals)</span></div>)}</div>
            </ModalCard>
          ) : null}

          {activeModal === 'people' ? (
            <ModalCard title="People" subtitle="Contacts are the center of the CRM workflow." onClose={() => setActiveModal(null)}>
              <form onSubmit={submitPerson} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', alignItems: 'center', gap: 10 }}><Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="New person" /><Input value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} placeholder="Email" /><button type="submit" style={textButton}>Add</button></form>
              <div style={{ display: 'grid', gap: 10 }}>{people.map((person) => <div key={person.id} style={itemRow}><strong style={{ color: 'var(--text-primary)' }}>{person.name}</strong>{person.email ? ` · ${person.email}` : ''}{person.organization ? ` · ${person.organization.name}` : ''}</div>)}</div>
            </ModalCard>
          ) : null}

          {activeModal === 'deals' ? (
            <ModalCard title="Deals" subtitle="Opportunities linked to people, organizations, and later projects." onClose={() => setActiveModal(null)}>
              <form onSubmit={submitDeal} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="New deal" /><button type="submit" style={textButton}>Add</button></form>
              <div style={{ display: 'grid', gap: 10 }}>{deals.map((deal) => <div key={deal.id} style={itemRow}><strong style={{ color: 'var(--text-primary)' }}>{deal.title}</strong> <span style={{ opacity: .65 }}>{deal.status}</span>{deal.organization ? ` · ${deal.organization.name}` : ''}</div>)}</div>
            </ModalCard>
          ) : null}
        </div>
      )}
    </AppShell>
  )
}
