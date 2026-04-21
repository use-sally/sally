'use client'

import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectMember } from '@sally/types/src'
import { useQueryClient } from '@tanstack/react-query'
import { getProjectMembers, updateTask } from '../lib/api'
import { qk } from '../lib/query'
import { projectInputField } from '../lib/theme'
import { AssigneeAvatar } from './assignee-avatar'
import { buildCollaboratorOptions, normalizeCollaboratorSelection, toggleCollaboratorSelection } from './collaborator-picker-helpers'

type CollaboratorPickerProps = {
  projectId: string
  taskId?: string
  assignee?: string | null
  value: string[]
  onSaved?: (value: string[]) => void
  canManage?: boolean
  placeholder?: string
}

export function CollaboratorPicker({
  projectId,
  taskId,
  assignee,
  value,
  onSaved,
  canManage = true,
  placeholder = 'No collaborators',
}: CollaboratorPickerProps) {
  const qc = useQueryClient()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedValues = useMemo(() => normalizeCollaboratorSelection(value, assignee), [assignee, value])
  const options = useMemo(() => buildCollaboratorOptions(members, selectedValues, assignee), [assignee, members, selectedValues])
  const selectedLabels = useMemo(() => selectedValues.map((entry) => options.find((option) => option.value === entry)?.label ?? entry), [options, selectedValues])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  async function ensureMembersLoaded() {
    if (loaded) return
    try {
      setError(null)
      setMembers(await getProjectMembers(projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project members')
    } finally {
      setLoaded(true)
    }
  }

  async function refreshAll() {
    await Promise.all([
      taskId ? qc.invalidateQueries({ queryKey: qk.task(taskId) }) : Promise.resolve(),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function persist(nextValue: string[]) {
    const normalized = normalizeCollaboratorSelection(nextValue, assignee)
    setSaving(true)
    setError(null)
    try {
      if (taskId) await updateTask(taskId, { collaborators: normalized })
      await refreshAll()
      onSaved?.(normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update collaborators')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(optionValue: string) {
    if (saving || !canManage) return
    await persist(toggleCollaboratorSelection(selectedValues, optionValue))
  }

  async function handleOpen() {
    if (!open) await ensureMembersLoaded()
    setOpen((current) => !current)
  }

  const triggerLabel = selectedLabels.length === 0
    ? placeholder
    : selectedLabels.length <= 2
      ? selectedLabels.join(', ')
      : `${selectedLabels.length} collaborators`

  if (!canManage) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ ...projectInputField, cursor: 'default' }}>{triggerLabel}</div>
        {selectedLabels.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {selectedLabels.map((label) => <span key={label} style={selectedFlag}>{label}</span>)}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div ref={rootRef} style={{ display: 'grid', gap: 8, position: 'relative' }}>
      <button type="button" onClick={() => void handleOpen()} aria-expanded={open} disabled={saving} style={triggerButton}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{saving ? 'Saving…' : triggerLabel}</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '−' : '+'}</span>
      </button>

      {selectedLabels.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {selectedLabels.map((label) => <span key={label} style={selectedFlag}>{label}</span>)}
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pick one or more project members. The assignee is excluded automatically.</div>
      )}

      {open ? (
        <div style={menuStyle}>
          {options.length ? options.map((option) => {
            const member = members.find((entry) => (entry.name || entry.email) === option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void handleToggle(option.value)}
                disabled={saving}
                style={{ ...optionButton, ...(option.selected ? optionButtonSelected : null) }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <AssigneeAvatar name={option.value} avatarUrl={member?.avatarUrl} size={24} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{option.label}</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: option.selected ? 'rgba(5, 46, 22, 0.75)' : 'var(--text-muted)' }}>{option.secondaryLabel}</div>
                  </div>
                </div>
                <span style={{ color: option.selected ? '#052e16' : 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{option.selected ? 'ON' : 'ADD'}</span>
              </button>
            )
          }) : <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No project members available.</div>}
        </div>
      ) : null}

      {error ? <div style={{ color: 'var(--danger-text)', fontSize: 12 }}>{error}</div> : null}
    </div>
  )
}

const triggerButton: React.CSSProperties = {
  ...projectInputField,
  borderRadius: 12,
  padding: '10px 12px',
  fontWeight: 700,
  fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`,
  outline: 'none',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  left: 0,
  right: 0,
  zIndex: 30,
  border: '1px solid var(--panel-border)',
  borderRadius: 14,
  background: 'var(--panel-bg)',
  boxShadow: 'var(--panel-shadow)',
  padding: 10,
  display: 'grid',
  gap: 6,
}

const optionButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  width: '100%',
  padding: '9px 10px',
  borderRadius: 10,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 12,
}

const optionButtonSelected: React.CSSProperties = {
  border: '1px solid rgba(250, 204, 21, 0.5)',
  background: '#fcd34d',
  color: '#052e16',
}

const selectedFlag: React.CSSProperties = {
  borderRadius: 999,
  border: '1px solid var(--form-border)',
  padding: '4px 10px',
  background: 'var(--form-bg)',
  color: 'var(--form-text)',
  fontSize: 11,
  fontWeight: 700,
  fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`,
}
