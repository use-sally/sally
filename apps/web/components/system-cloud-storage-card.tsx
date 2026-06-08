'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import type { EditionInfo } from '@sally/types/src'
import { getEdition } from '../lib/api'
import { EnterpriseLockedCard } from './enterprise-locked-card'
import { CloudStorageIntegrationsPanel } from './cloud-storage-integrations-panel'

const description = 'Configure Google Drive, Microsoft 365, SharePoint, OneDrive, and Dropbox OAuth credentials from the Sally admin UI. Available in Sally Enterprise.'

const cardStyle: CSSProperties = {
  border: '1px solid var(--panel-border)',
  borderRadius: 16,
  background: 'var(--panel-bg)',
  padding: 18,
  display: 'grid',
  gap: 8,
  textAlign: 'left',
  cursor: 'pointer',
}

const modalBackdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(15, 23, 42, 0.58)' }
const modalPanel: CSSProperties = { width: 'min(920px, calc(100vw - 36px))', maxHeight: 'min(820px, calc(100vh - 36px))', overflow: 'hidden', border: '1px solid var(--panel-border)', borderRadius: 20, background: 'var(--form-bg)', color: 'var(--text-primary)', boxShadow: '0 28px 90px rgba(15,23,42,0.38)', display: 'flex', flexDirection: 'column' }
const modalCloseButton: CSSProperties = { border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--font-26)', lineHeight: 1, padding: '0 4px' }

function CloudStorageModal({ onClose }: { onClose: () => void }) {
  return (
    <div role="presentation" style={modalBackdrop} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="cloud-storage-integrations-title" style={modalPanel} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid var(--panel-border)', flex: '0 0 auto' }}>
          <div>
            <h2 id="cloud-storage-integrations-title" style={{ margin: 0, color: 'var(--heading-text)', fontSize: 'var(--font-18)' }}>Cloud storage integrations</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.5 }}>{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close cloud storage integrations modal" style={modalCloseButton}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', minHeight: 0 }}>
          <CloudStorageIntegrationsPanel />
        </div>
      </div>
    </div>
  )
}

export function SystemCloudStorageCard() {
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getEdition().then((info) => { if (!cancelled) setEdition(info) }).catch(() => { if (!cancelled) setEdition(null) })
    return () => { cancelled = true }
  }, [])

  if (!edition?.availableFeatures?.includes('integrations.cloudStorage')) return <EnterpriseLockedCard title="Cloud storage integrations" description={description} />

  return (
    <>
      <button type="button" onClick={() => setModalOpen(true)} aria-pressed={modalOpen} style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--task-title)', fontSize: 'var(--font-16)' }}>Cloud storage integrations</h3>
          <span style={{ border: '1px solid rgba(250,204,21,0.32)', borderRadius: 999, padding: '4px 8px', color: 'var(--task-title)', fontSize: 'var(--font-11)', fontWeight: 700 }}>Enterprise</span>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-13)', lineHeight: 1.55 }}>{description}</p>
        <span style={{ color: 'var(--task-title)', fontSize: 'var(--font-12)', fontWeight: 750 }}>{modalOpen ? 'Modal open' : 'Open modal'} →</span>
      </button>
      {modalOpen ? <CloudStorageModal onClose={() => setModalOpen(false)} /> : null}
    </>
  )
}
