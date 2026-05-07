'use client'

import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { updateTask } from '../lib/api'
import { qk } from '../lib/query'
import { statusChipStyle } from '../lib/status-colors'

type StatusOption = {
  id: string
  name: string
  color?: string | null
}

type StatusChipPickerProps = {
  taskId: string
  projectId: string
  currentStatusId: string
  currentStatusName: string
  currentStatusColor?: string | null
  statuses: StatusOption[]
  canManage?: boolean
  onSaved?: (statusId: string) => void
}

export function StatusChipPicker({
  taskId,
  projectId,
  currentStatusId,
  currentStatusName,
  currentStatusColor,
  statuses,
  canManage = true,
  onSaved,
}: StatusChipPickerProps) {
  const qc = useQueryClient()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null)
      return
    }
    function updatePosition() {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 6, left: rect.right })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  async function selectStatus(nextStatusId: string) {
    if (!canManage || saving) return
    if (nextStatusId === currentStatusId) {
      setOpen(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTask(taskId, { statusId: nextStatusId })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.board(projectId) }),
        qc.invalidateQueries({ queryKey: qk.project(projectId) }),
        qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
        qc.invalidateQueries({ queryKey: qk.task(taskId) }),
        qc.invalidateQueries({ queryKey: qk.projectsSummary }),
      ])
      onSaved?.(nextStatusId)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change status')
    } finally {
      setSaving(false)
    }
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => { if (!canManage || saving) return; setOpen((current) => !current) }}
      disabled={!canManage || saving}
      aria-expanded={open}
      aria-haspopup="listbox"
      title={canManage ? 'Click to change status' : currentStatusName}
      className="status-chip"
      style={{ ...statusChipStyle(currentStatusColor), ...triggerOverrides, opacity: saving ? 0.7 : 1, cursor: canManage ? 'pointer' : 'default' }}
    >
      {currentStatusName}
    </button>
  )

  const menu = open && menuPos ? (
    <div
      ref={menuRef}
      role="listbox"
      style={{ ...menuStyle, top: menuPos.top, left: 'auto', right: Math.max(8, window.innerWidth - menuPos.left) }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {statuses.map((status) => {
        const selected = status.id === currentStatusId
        return (
          <button
            key={status.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => void selectStatus(status.id)}
            disabled={saving}
            style={{ ...optionRow, ...(selected ? optionRowSelected : null) }}
          >
            <span style={{ ...colorDot, background: status.color || 'var(--text-muted)' }} aria-hidden="true" />
            <span style={{ flex: 1, textAlign: 'left' }}>{status.name}</span>
            {selected ? <span aria-hidden="true" style={selectedMark}>✓</span> : null}
          </button>
        )
      })}
      {error ? <div style={errorRow}>{error}</div> : null}
    </div>
  ) : null

  return (
    <>
      {trigger}
      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </>
  )
}

const triggerOverrides: React.CSSProperties = {
  font: 'inherit',
}

const menuStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 40,
  minWidth: 200,
  maxWidth: 260,
  border: '1px solid var(--panel-border)',
  borderRadius: 12,
  background: 'var(--panel-bg)',
  boxShadow: 'var(--panel-shadow)',
  padding: 6,
  display: 'grid',
  gap: 2,
}

const optionRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  border: '1px solid transparent',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
  textAlign: 'left',
}

const optionRowSelected: React.CSSProperties = {
  background: 'rgba(52, 211, 153, 0.14)',
  border: '1px solid rgba(52, 211, 153, 0.32)',
}

const colorDot: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  flex: '0 0 auto',
  border: '1px solid rgba(255, 255, 255, 0.18)',
}

const selectedMark: React.CSSProperties = {
  color: 'var(--checkbox-fill, #34d399)',
  fontWeight: 800,
}

const errorRow: React.CSSProperties = {
  marginTop: 6,
  padding: '6px 10px',
  color: 'var(--danger-text)',
  fontSize: 12,
}
