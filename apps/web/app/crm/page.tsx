'use client'

import { FormEvent, useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { AppShell, panel } from '../../components/app-shell'
import { EnterpriseLockedCard } from '../../components/enterprise-locked-card'
import { createCrmDeal, createCrmOrganization, createCrmPerson, getCrmStatus, getEdition, listCrmDeals, listCrmOrganizations, listCrmPeople, type CrmDeal, type CrmOrganization, type CrmPerson } from '../../lib/api'
import { hasFeature, type EditionInfo } from '../../lib/edition'

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ width: '100%', border: '1px solid var(--panel-border)', borderRadius: 10, background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '10px 12px', fontSize: 'var(--font-14)', ...props.style }} />
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ ...panel, display: 'grid', gap: 12 }}><div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>{children}</div>
}

export default function CrmPage() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [organizations, setOrganizations] = useState<CrmOrganization[]>([])
  const [people, setPeople] = useState<CrmPerson[]>([])
  const [deals, setDeals] = useState<CrmDeal[]>([])
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
    <AppShell title="CRM" subtitle="Headless customer relationship management for humans and agents.">
      {!enabled ? (
        <EnterpriseLockedCard title="Sally CRM add-on" description="Organizations, people, deals, and activities are an optional Sally add-on designed to be API/MCP-first." />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <Section title="Sally CRM add-on enabled">
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-14)', lineHeight: 1.6 }}>{status || 'Loading CRM…'}</p>
            {error ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{error}</div> : null}
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <Section title="Organizations">
              <form onSubmit={submitOrg} style={{ display: 'flex', gap: 8 }}><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="New organization" /><button className="button">Add</button></form>
              {organizations.map((org) => <div key={org.id} style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-14)' }}>{org.name} <span style={{ opacity: .65 }}>({org._count?.people ?? 0} people, {org._count?.deals ?? 0} deals)</span></div>)}
            </Section>
            <Section title="People">
              <form onSubmit={submitPerson} style={{ display: 'grid', gap: 8 }}><Input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="New person" /><Input value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} placeholder="Email" /><button className="button">Add</button></form>
              {people.map((person) => <div key={person.id} style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-14)' }}>{person.name}{person.email ? ` · ${person.email}` : ''}</div>)}
            </Section>
            <Section title="Deals">
              <form onSubmit={submitDeal} style={{ display: 'flex', gap: 8 }}><Input value={dealTitle} onChange={(e) => setDealTitle(e.target.value)} placeholder="New deal" /><button className="button">Add</button></form>
              {deals.map((deal) => <div key={deal.id} style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-14)' }}>{deal.title} <span style={{ opacity: .65 }}>{deal.status}</span></div>)}
            </Section>
          </div>
        </div>
      )}
    </AppShell>
  )
}
