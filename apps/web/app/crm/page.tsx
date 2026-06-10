'use client'

import { FormEvent, Suspense, useEffect, useMemo, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell, panel } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { createCrmDeal, createCrmOrganization, createCrmPerson, getCrmStatus, getEdition, listCrmDeals, listCrmOrganizations, listCrmPeople, updateCrmDeal, updateCrmOrganization, updateCrmPerson, type CrmDeal, type CrmOrganization, type CrmPerson } from '../../lib/api'
import { hasFeature, type EditionInfo } from '../../lib/edition'

type CrmSection = 'organizations' | 'people' | 'deals'

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ width: '100%', border: '1px solid var(--panel-border)', borderRadius: 10, background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: 'var(--font-14)', ...props.style }} />
}
function Section({ title, children }: { title: string; children: ReactNode }) { return <div style={{ ...panel, display: 'grid', gap: 12 }}><div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>{children}</div> }
function ModalCard({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div style={modalBackdrop} onMouseDown={onClose}><div style={modalCard} onMouseDown={(event) => event.stopPropagation()}><button type="button" onClick={onClose} aria-label="Close" style={modalCloseButton}>×</button><div style={{ display: 'grid', gap: 6 }}><div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-24)', fontWeight: 850, letterSpacing: '-0.03em' }}>{title}</div><div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.5 }}>{subtitle}</div></div>{children}</div></div>
}

const textButton: CSSProperties = { border: 'none', background: 'transparent', color: 'var(--text-secondary)', padding: 0, fontSize: 'var(--font-13)', fontWeight: 800, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }
const modalBackdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(2, 6, 23, 0.68)', backdropFilter: 'blur(8px)' }
const modalCard: CSSProperties = { position: 'relative', width: 'min(760px, 100%)', maxHeight: 'min(760px, calc(100vh - 48px))', overflow: 'auto', border: '1px solid var(--panel-border)', borderRadius: 24, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', padding: 24, display: 'grid', gap: 18 }
const modalCloseButton: CSSProperties = { position: 'absolute', top: 14, right: 16, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--font-26)', lineHeight: 1, padding: '0 4px' }
const rowButton: CSSProperties = { border: 'none', borderTop: '1px solid var(--panel-border)', background: 'transparent', padding: '12px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-14)', lineHeight: 1.5, cursor: 'pointer', textAlign: 'left' }

function CrmPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const section = (searchParams.get('section') as CrmSection | null) || 'people'
  const selectedPersonId = searchParams.get('personId')
  const selectedOrganizationId = searchParams.get('organizationId')
  const selectedDealId = searchParams.get('dealId')

  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [organizations, setOrganizations] = useState<CrmOrganization[]>([])
  const [people, setPeople] = useState<CrmPerson[]>([])
  const [deals, setDeals] = useState<CrmDeal[]>([])
  const [orgName, setOrgName] = useState('')
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [dealTitle, setDealTitle] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})

  async function loadCrm() {
    const [crmStatus, orgs, crmPeople, crmDeals] = await Promise.all([getCrmStatus(), listCrmOrganizations(), listCrmPeople(), listCrmDeals()])
    setStatus(crmStatus.message); setOrganizations(orgs.items); setPeople(crmPeople.items); setDeals(crmDeals.items)
  }
  useEffect(() => { let cancelled = false; getEdition().then(async (info) => { if (cancelled) return; setEdition(info); if (hasFeature(info, 'crm.core')) await loadCrm() }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load CRM') }); return () => { cancelled = true } }, [])

  const enabled = hasFeature(edition, 'crm.core')
  const q = filter.trim().toLowerCase()
  const visiblePeople = useMemo(() => people.filter((p) => !q || [p.name, p.email, p.organization?.name].some((v) => v?.toLowerCase().includes(q))), [people, q])
  const visibleOrganizations = useMemo(() => organizations.filter((o) => !q || [o.name, o.website].some((v) => v?.toLowerCase().includes(q))), [organizations, q])
  const visibleDeals = useMemo(() => deals.filter((d) => !q || [d.title, d.organization?.name, d.status].some((v) => v?.toLowerCase().includes(q))), [deals, q])
  const selectedPerson = people.find((p) => p.id === selectedPersonId)
  const selectedOrganization = organizations.find((o) => o.id === selectedOrganizationId)
  const selectedDeal = deals.find((d) => d.id === selectedDealId)
  const closeModal = () => router.push(`/crm?section=${section}`)

  function openDetail(nextSection: CrmSection, idKey: string, id: string) { setDraft({}); router.push(`/crm?section=${nextSection}&${idKey}=${id}`) }
  async function submitOrg(event: FormEvent) { event.preventDefault(); if (!orgName.trim()) return; await createCrmOrganization({ name: orgName.trim() }); setOrgName(''); await loadCrm() }
  async function submitPerson(event: FormEvent) { event.preventDefault(); if (!personName.trim()) return; await createCrmPerson({ name: personName.trim(), email: personEmail.trim() || undefined }); setPersonName(''); setPersonEmail(''); await loadCrm() }
  async function submitDeal(event: FormEvent) { event.preventDefault(); if (!dealTitle.trim()) return; await createCrmDeal({ title: dealTitle.trim(), status: 'OPEN' }); setDealTitle(''); await loadCrm() }

  return <AppShell title="CRM" subtitle="A separate Sally surface for relationships, deals, and agent-ready customer context.">
    {!enabled ? <EnterpriseLockedCard title="Sally CRM add-on" description="Organizations, people, deals, and activities are an optional Sally add-on designed to be API/MCP-first." /> : <div style={{ display: 'grid', gap: 16 }}>
      <Section title={section === 'people' ? 'People' : section === 'organizations' ? 'Organizations' : 'Deals'}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-14)', lineHeight: 1.6 }}>{status || 'Loading CRM…'} Filter the list, then click a row to open the detail modal.</p>
        {error ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{error}</div> : null}
        <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${section}`} />
      </Section>

      {section === 'people' ? <Section title="All people"><form onSubmit={submitPerson} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', alignItems: 'center', gap: 10 }}><Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="New person" /><Input value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} placeholder="Email" /><button type="submit" style={textButton}>Add</button></form>{visiblePeople.map((person) => <button key={person.id} type="button" onClick={() => openDetail('people', 'personId', person.id)} style={rowButton}><strong style={{ color: 'var(--text-primary)' }}>{person.name}</strong>{person.email ? ` · ${person.email}` : ''}{person.organization ? ` · ${person.organization.name}` : ''}</button>)}</Section> : null}
      {section === 'organizations' ? <Section title="All organizations"><form onSubmit={submitOrg} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="New organization" /><button type="submit" style={textButton}>Add</button></form>{visibleOrganizations.map((org) => <button key={org.id} type="button" onClick={() => openDetail('organizations', 'organizationId', org.id)} style={rowButton}><strong style={{ color: 'var(--text-primary)' }}>{org.name}</strong> <span style={{ opacity: .65 }}>({org._count?.people ?? 0} people, {org._count?.deals ?? 0} deals)</span></button>)}</Section> : null}
      {section === 'deals' ? <Section title="All deals"><form onSubmit={submitDeal} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="New deal" /><button type="submit" style={textButton}>Add</button></form>{visibleDeals.map((deal) => <button key={deal.id} type="button" onClick={() => openDetail('deals', 'dealId', deal.id)} style={rowButton}><strong style={{ color: 'var(--text-primary)' }}>{deal.title}</strong> <span style={{ opacity: .65 }}>{deal.status}</span>{deal.organization ? ` · ${deal.organization.name}` : ''}</button>)}</Section> : null}

      {selectedPerson ? <ModalCard title={selectedPerson.name} subtitle="Person" onClose={closeModal}><Input value={draft.name ?? selectedPerson.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name" /><Input value={draft.email ?? selectedPerson.email ?? ''} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="Email" /><Input value={draft.phone ?? selectedPerson.phone ?? ''} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="Phone" /><Input value={draft.title ?? selectedPerson.title ?? ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Title" /><button type="button" style={textButton} onClick={async () => { await updateCrmPerson(selectedPerson.id, { name: draft.name ?? selectedPerson.name, email: draft.email ?? selectedPerson.email ?? null, phone: draft.phone ?? selectedPerson.phone ?? null, title: draft.title ?? selectedPerson.title ?? null }); await loadCrm(); closeModal() }}>Save</button></ModalCard> : null}
      {selectedOrganization ? <ModalCard title={selectedOrganization.name} subtitle="Organization" onClose={closeModal}><Input value={draft.name ?? selectedOrganization.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Name" /><Input value={draft.website ?? selectedOrganization.website ?? ''} onChange={(e) => setDraft((d) => ({ ...d, website: e.target.value }))} placeholder="Website" /><button type="button" style={textButton} onClick={async () => { await updateCrmOrganization(selectedOrganization.id, { name: draft.name ?? selectedOrganization.name, website: draft.website ?? selectedOrganization.website ?? null }); await loadCrm(); closeModal() }}>Save</button></ModalCard> : null}
      {selectedDeal ? <ModalCard title={selectedDeal.title} subtitle="Deal" onClose={closeModal}><Input value={draft.title ?? selectedDeal.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Title" /><Input value={draft.stage ?? selectedDeal.stage ?? ''} onChange={(e) => setDraft((d) => ({ ...d, stage: e.target.value }))} placeholder="Stage" /><Input value={draft.value ?? String(selectedDeal.value ?? '')} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} placeholder="Value" /><button type="button" style={textButton} onClick={async () => { await updateCrmDeal(selectedDeal.id, { title: draft.title ?? selectedDeal.title, stage: draft.stage ?? selectedDeal.stage ?? null, value: draft.value ? Number(draft.value) : selectedDeal.value ?? null }); await loadCrm(); closeModal() }}>Save</button></ModalCard> : null}
    </div>}
  </AppShell>
}

export default function CrmPage() {
  return <Suspense fallback={null}><CrmPageContent /></Suspense>
}
