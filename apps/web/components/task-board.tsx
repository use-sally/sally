'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, DragEndEvent, DragOverEvent, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BoardCard, BoardColumn, ProjectAutomationOverview } from '@sally/types/src'
import { createProjectStatus, createTask, reorderProjectStatuses, reorderTask, updateProjectStatus } from '../lib/api'
import { qk } from '../lib/query'
import { automationBadgeStyle, getTaskAutomationBadge } from '../lib/task-automation'
import { pill, priorityStars, tagStyle } from './app-shell'
import { TaskPeopleAvatarStack } from './task-people-avatar-stack'
import { labelText, projectInputField, taskTitleText } from '../lib/theme'
import { canonicalStatusColor, resolveStatusPair, statusChipStyle, statusThemeVars, STATUS_COLOR_PAIRS } from '../lib/status-colors'

function dueBadge(dueDate: string | null) {
  if (!dueDate) return null
  const today = new Date()
  const due = new Date(dueDate)
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diff = Math.round((dueDateOnly.getTime() - todayDate.getTime()) / 86400000)
  if (diff < 0) return { label: 'Overdue', bg: '#fee2e2', color: '#991b1b' }
  if (diff === 0) return { label: 'Today', bg: '#fef3c7', color: '#92400e' }
  return { label: due.toLocaleDateString(), bg: '#eef2ff', color: '#3730a3' }
}

type StatusType = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'DONE'
type StatusEditDraft = { name: string; type: StatusType; color: string }

const BOARD_COLUMN_WIDTH = 320

export function TaskBoard({ columns, taskBaseHref, projectId, canReorderStatuses = false, canManageStatuses = canReorderStatuses, automationOverview }: { columns: BoardColumn[]; taskBaseHref?: string; projectId: string; canReorderStatuses?: boolean; canManageStatuses?: boolean; automationOverview?: ProjectAutomationOverview | null }) {
  const qc = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [board, setBoard] = useState<BoardColumn[]>(columns)
  const [newStatus, setNewStatus] = useState('')
  const [newStatusType, setNewStatusType] = useState<StatusType>('BACKLOG')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
  const [statusEditDraft, setStatusEditDraft] = useState<StatusEditDraft>({ name: '', type: 'BACKLOG', color: '#1F2937' })

  useEffect(() => setBoard(columns), [columns])

  const pinnedColumn = useMemo(() => board[0] || null, [board])
  const movableColumns = useMemo(() => board.slice(1), [board])

  async function invalidateBoard() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: ['projects'] }),
      qc.invalidateQueries({ queryKey: qk.projectsSummary }),
    ])
  }

  async function addInlineTask(statusId: string) {
    const title = (drafts[statusId] || '').trim()
    if (!title) return
    setSavingFor(statusId)
    try {
      await createTask({ projectId, title, statusId })
      setDrafts((d) => ({ ...d, [statusId]: '' }))
      await invalidateBoard()
    } finally {
      setSavingFor(null)
    }
  }

  function findColumnByTaskId(taskId: string) {
    return board.find((col) => col.cards.some((card) => card.id === taskId))
  }

  function findColumnById(id: string) {
    return board.find((col) => col.id === id)
  }

  async function persistMove(taskId: string, targetStatusId: string, nextBoard: BoardColumn[]) {
    const targetCol = nextBoard.find((c) => c.id === targetStatusId)
    if (!targetCol) return
    await reorderTask({ taskId, targetStatusId, orderedTaskIds: targetCol.cards.map((c) => c.id) })
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.task(taskId) }),
      invalidateBoard(),
    ])
  }

  async function persistStatusOrder(orderedStatusIds: string[]) {
    await reorderProjectStatuses(projectId, orderedStatusIds)
    await invalidateBoard()
  }

  async function addStatus() {
    const name = newStatus.trim()
    if (!name || statusSaving) return
    setStatusSaving(true)
    setStatusError(null)
    try {
      await createProjectStatus(projectId, { name, type: newStatusType })
      setNewStatus('')
      setNewStatusType('BACKLOG')
      await invalidateBoard()
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to add status')
    } finally {
      setStatusSaving(false)
    }
  }

  function openStatusEditor(status: BoardColumn) {
    if (!canManageStatuses) return
    setEditingStatusId(status.id)
    setStatusEditDraft({ name: status.title, type: status.type as StatusType, color: status.color || '#1F2937' })
    setStatusError(null)
  }

  function cancelStatusEdit() {
    setEditingStatusId(null)
  }

  async function saveStatusEdit(status: BoardColumn) {
    const name = statusEditDraft.name.trim()
    if (statusSaving) return
    if (!name) {
      setEditingStatusId(null)
      return
    }
    const color = canonicalStatusColor(statusEditDraft.color) || statusEditDraft.color || '#1F2937'
    setStatusSaving(true)
    setStatusError(null)
    try {
      setBoard((current) => current.map((column) => column.id === status.id ? { ...column, title: name, type: statusEditDraft.type, color } : column))
      await updateProjectStatus(projectId, status.id, { name, type: statusEditDraft.type, color })
      setEditingStatusId(null)
      await invalidateBoard()
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update status')
      await invalidateBoard()
    } finally {
      setStatusSaving(false)
    }
  }

  function statusTypeLabel(value: string) {
    return value.toLowerCase().replace(/_/g, ' ')
  }

  function onDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId) return

    const activeColumnById = board.find((col) => col.id === activeId)
    const overColumnById = board.find((col) => col.id === overId)
    if (canReorderStatuses && activeColumnById && overColumnById) return

    const activeCol = findColumnByTaskId(activeId)
    const overCol = findColumnById(overId) || findColumnByTaskId(overId)
    if (!activeCol || !overCol) return
    if (activeCol.id === overCol.id) return

    setBoard((prev) => {
      const source = prev.find((c) => c.id === activeCol.id)
      const target = prev.find((c) => c.id === overCol.id)
      if (!source || !target) return prev
      const moving = source.cards.find((c) => c.id === activeId)
      if (!moving) return prev
      return prev.map((col) => {
        if (col.id === source.id) return { ...col, cards: col.cards.filter((c) => c.id !== activeId) }
        if (col.id === target.id) return { ...col, cards: [...col.cards, { ...moving, status: target.title, statusId: target.id, statusColor: target.color, position: target.cards.length }] }
        return col
      })
    })
  }

  async function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId) return

    const activeColumnById = board.find((col) => col.id === activeId)
    const overColumnById = board.find((col) => col.id === overId)
    if (canReorderStatuses && activeColumnById && overColumnById) {
      if (activeColumnById.id === pinnedColumn?.id || overColumnById.id === pinnedColumn?.id) return
      const oldIndex = movableColumns.findIndex((col) => col.id === activeId)
      const newIndex = movableColumns.findIndex((col) => col.id === overId)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
      const reordered = arrayMove(movableColumns, oldIndex, newIndex)
      setBoard([...(pinnedColumn ? [pinnedColumn] : []), ...reordered])
      await persistStatusOrder(reordered.map((col) => col.id))
      return
    }

    const activeCol = board.find((col) => col.cards.some((card) => card.id === activeId))
    const overCol = findColumnById(overId) || board.find((col) => col.cards.some((card) => card.id === overId))
    if (!activeCol || !overCol) return

    let nextBoard = board
    if (activeCol.id === overCol.id) {
      const oldIndex = activeCol.cards.findIndex((c) => c.id === activeId)
      const newIndex = overCol.cards.findIndex((c) => c.id === overId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        nextBoard = board.map((c) => c.id === activeCol.id ? { ...c, cards: arrayMove(c.cards, oldIndex, newIndex).map((card, index) => ({ ...card, position: index })) } : c)
        setBoard(nextBoard)
      }
    } else {
      nextBoard = board.map((col) => ({ ...col, cards: col.cards.map((card, index) => ({ ...card, position: index })) }))
      setBoard(nextBoard)
    }

    await persistMove(activeId, overCol.id, nextBoard)
  }

  return (
    <DndContext sensors={sensors} onDragOver={onDragOver} onDragEnd={(e) => { void onDragEnd(e) }}>
      <SortableContext items={movableColumns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          {statusError ? <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{statusError}</div> : null}
          <div data-board-scroll="true" style={{ overflowX: 'auto', overflowY: 'hidden', maxWidth: '100%', paddingBottom: 8 }}>
            <div data-board-columns="true" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, width: 'max-content', minWidth: '100%' }}>
              {pinnedColumn ? <BoardColumnView key={pinnedColumn.id} column={pinnedColumn} taskBaseHref={taskBaseHref || ''} drafts={drafts} setDrafts={setDrafts} addInlineTask={addInlineTask} savingFor={savingFor} automationOverview={automationOverview} pinned canManageStatuses={canManageStatuses} statusTypeLabel={statusTypeLabel} statusSaving={statusSaving} editingStatusId={editingStatusId} statusEditDraft={statusEditDraft} setStatusEditDraft={setStatusEditDraft} openStatusEditor={openStatusEditor} saveStatusEdit={saveStatusEdit} cancelStatusEdit={cancelStatusEdit} /> : null}
              {movableColumns.map((column) => (
                <BoardColumnView key={column.id} column={column} taskBaseHref={taskBaseHref || ''} drafts={drafts} setDrafts={setDrafts} addInlineTask={addInlineTask} savingFor={savingFor} automationOverview={automationOverview} reorderable={canReorderStatuses} canManageStatuses={canManageStatuses} statusTypeLabel={statusTypeLabel} statusSaving={statusSaving} editingStatusId={editingStatusId} statusEditDraft={statusEditDraft} setStatusEditDraft={setStatusEditDraft} openStatusEditor={openStatusEditor} saveStatusEdit={saveStatusEdit} cancelStatusEdit={cancelStatusEdit} />
              ))}
              {canManageStatuses ? <AddStatusColumn newStatus={newStatus} setNewStatus={setNewStatus} newStatusType={newStatusType} setNewStatusType={setNewStatusType} addStatus={addStatus} statusSaving={statusSaving} /> : null}
            </div>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  )
}

function BoardColumnView({ column, taskBaseHref, drafts, setDrafts, addInlineTask, savingFor, automationOverview, reorderable = false, pinned = false, canManageStatuses = false, statusTypeLabel, statusSaving, editingStatusId, statusEditDraft, setStatusEditDraft, openStatusEditor, saveStatusEdit, cancelStatusEdit }: any) {
  const { setNodeRef } = useDroppable({ id: column.id })
  const sortable = useSortable({ id: column.id, disabled: !reorderable })
  const isEditing = editingStatusId === column.id
  const displayColor = isEditing ? statusEditDraft.color : column.color
  const colorPair = resolveStatusPair(displayColor)

  return (
    <div className="status-lane-surface" ref={(node) => { setNodeRef(node); sortable.setNodeRef(node) }} style={{ ...boardColumnStyle(), ...statusThemeVars(displayColor), transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.7 : 1 }}>
      <div data-board-status-editor={isEditing ? column.id : undefined} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void saveStatusEdit(column)
      }} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {reorderable ? <button type="button" {...sortable.attributes} {...sortable.listeners} aria-label={`Reorder ${column.title}`} style={boardDragHandle}>⋮⋮</button> : null}
            {canManageStatuses && isEditing ? (
              <input
                value={statusEditDraft.name}
                onChange={(event) => setStatusEditDraft({ ...statusEditDraft, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); void saveStatusEdit(column) }
                  if (event.key === 'Escape') { event.preventDefault(); cancelStatusEdit() }
                }}
                aria-label={`Status name for ${column.title}`}
                disabled={statusSaving}
                autoFocus
                style={{ ...statusGroupTextStyle(displayColor), ...statusNameInputStyle }}
              />
            ) : canManageStatuses ? (
              <button type="button" onClick={() => openStatusEditor(column)} title={`Edit ${column.title}`} style={{ ...statusGroupTextStyle(displayColor), ...statusTitleButton }}>
                {column.title}
              </button>
            ) : <div style={statusGroupTextStyle(displayColor)}>{column.title}</div>}
            {pinned ? <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>Pinned</span> : null}
          </div>
          <div style={{ color: colorPair?.darkText ?? 'var(--text-muted)', fontSize: 'var(--font-13)' }}>{column.cards.length}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}>
          {isEditing ? (
            <select
              value={statusEditDraft.type}
              onChange={(event) => setStatusEditDraft({ ...statusEditDraft, type: event.target.value as StatusType })}
              disabled={statusSaving}
              aria-label={`Status type for ${column.title}`}
              style={statusTypeSelectStyle}
            >
              <option value="BACKLOG">Backlog</option>
              <option value="TODO">Todo</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="REVIEW">Review</option>
              <option value="DONE">Done</option>
            </select>
          ) : <span style={{ ...labelText, fontSize: 'var(--font-11)' }}>{statusTypeLabel ? statusTypeLabel(column.type) : column.type}</span>}
        </div>
        {isEditing ? (
          <StatusEditor
            draft={statusEditDraft}
            setDraft={setStatusEditDraft}
            saving={statusSaving}
          />
        ) : null}
      </div>

      <SortableContext items={column.cards.map((c: BoardCard) => c.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          {column.cards.map((card: BoardCard) => <SortableTaskCard key={card.id} card={card} taskBaseHref={taskBaseHref} automationOverview={automationOverview} />)}
        </div>
      </SortableContext>

      <div style={{ display: 'grid', gap: 6 }}>
        <input
          value={drafts[column.id] || ''}
          onChange={(e) => setDrafts((d: Record<string, string>) => ({ ...d, [column.id]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') void addInlineTask(column.id) }}
          placeholder={`Add to ${column.title}`}
          style={boardInput}
        />
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>{savingFor === column.id ? 'Adding…' : 'Press Enter to create'}</div>
      </div>
    </div>
  )
}

function StatusEditor({ draft, setDraft, saving }: { draft: StatusEditDraft; setDraft: (draft: StatusEditDraft) => void; saving: boolean }) {
  return (
    <div style={statusEditorStyle}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS_COLOR_PAIRS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={saving}
            onClick={() => setDraft({ ...draft, color: canonicalStatusColor(preset.darkBg) || preset.darkBg })}
            title={`Set color ${preset.id}`}
            style={{ ...statusColorOptionButton, color: preset.darkText, borderColor: canonicalStatusColor(draft.color) === preset.darkBg ? preset.darkText : 'var(--panel-border)' }}
          >
            {preset.id}
          </button>
        ))}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>{saving ? 'Saving…' : 'Changes save when focus leaves this editor.'}</div>
    </div>
  )
}

function AddStatusColumn({ newStatus, setNewStatus, newStatusType, setNewStatusType, addStatus, statusSaving }: { newStatus: string; setNewStatus: (value: string) => void; newStatusType: StatusType; setNewStatusType: (value: StatusType) => void; addStatus: () => Promise<void>; statusSaving: boolean }) {
  return (
    <div style={addStatusColumnStyle}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ ...labelText, fontSize: 'var(--font-12)' }}>New status</div>
        <input
          value={newStatus}
          onChange={(event) => setNewStatus(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void addStatus() }}
          placeholder="Add board column"
          disabled={statusSaving}
          style={boardInput}
        />
        <select value={newStatusType} onChange={(event) => setNewStatusType(event.target.value as StatusType)} disabled={statusSaving} style={boardInput}>
          <option value="BACKLOG">Backlog</option>
          <option value="TODO">Todo</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="BLOCKED">Blocked</option>
          <option value="REVIEW">Review</option>
          <option value="DONE">Done</option>
        </select>
        <button type="button" onClick={() => void addStatus()} disabled={statusSaving || !newStatus.trim()} style={addStatusButton}>{statusSaving ? 'Adding…' : 'Add status'}</button>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>Creates a new board column here.</div>
      </div>
    </div>
  )
}

function SortableTaskCard({ card, taskBaseHref, automationOverview }: { card: BoardCard; taskBaseHref: string; automationOverview?: ProjectAutomationOverview | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const badge = dueBadge(card.dueDate)
  const automationBadge = getTaskAutomationBadge(automationOverview, card.id)
  const automationTone = automationBadge ? automationBadgeStyle(automationBadge.tone) : null

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, minWidth: 0 }}>
      <Link href={`${taskBaseHref}?view=board&task=${card.id}`} style={{ textAlign: 'left', textDecoration: 'none', color: 'inherit', display: 'block', minWidth: 0 }}>
        <div style={{ ...boardCardStyle(card.statusColor), color: 'var(--form-text)', background: 'var(--form-bg)', borderRadius: 12, border: '1px solid var(--form-border)', padding: 12, display: 'grid', gap: 8, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }}>
          <div {...attributes} {...listeners} style={{ cursor: 'grab', minWidth: 0 }}>
            <div style={{ ...taskTitleText, fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{card.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: 6 }}>#{card.number}</span> : null}{card.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--text-muted)', fontSize: 'var(--font-13)' }}>
            <TaskPeopleAvatarStack owner={card.owner} ownerAvatarUrl={card.ownerAvatarUrl} participants={card.participants} assignee={card.assignee} assigneeAvatarUrl={card.assigneeAvatarUrl} collaborators={card.collaborators} size={28} maxVisible={3} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ color: 'var(--text-primary)' }}>{priorityStars(card.priority)}</span>
              <span className="status-chip" style={statusChipStyle(card.statusColor)}>{card.status}</span>
            </div>
          </div>
          {card.labels?.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{card.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}</div> : null}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {automationBadge && automationTone ? <span title={automationBadge.detail || undefined} style={pill(automationTone.background, automationTone.color)}>{automationBadge.label}</span> : null}
            {card.todoProgress ? <span style={pill('#ecfeff', '#155e75')}>Todos {card.todoProgress}</span> : null}
            {badge ? <span style={pill(badge.bg, badge.color)}>{badge.label}</span> : null}
          </div>
        </div>
      </Link>
    </div>
  )
}

const boardInput: React.CSSProperties = { ...projectInputField, padding: '10px 12px' }
const boardDragHandle: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'grab', fontSize: 'var(--font-18)', lineHeight: 1, padding: 2 }
const boardColorOptionButton: React.CSSProperties = { background: 'transparent', border: 'none', padding: '6px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, textTransform: 'lowercase', fontSize: 'var(--font-13)', fontWeight: 500 }
const statusTitleButton: React.CSSProperties = { background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }
const statusNameInputStyle: React.CSSProperties = { background: 'transparent', border: 'none', borderBottom: '1px solid currentColor', borderRadius: 0, padding: '2px 0', minWidth: 0, width: '100%', outline: 'none' }
const statusTypeSelectStyle: React.CSSProperties = { ...projectInputField, width: 'auto', minWidth: 118, padding: '7px 28px 7px 10px', fontSize: 'var(--font-11)', fontWeight: 800, textTransform: 'uppercase', borderRadius: 999 }
const statusEditorStyle: React.CSSProperties = { display: 'grid', gap: 8, padding: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--form-bg)' }
const statusColorOptionButton: React.CSSProperties = { background: 'transparent', border: '1px solid var(--panel-border)', padding: '5px 8px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, textTransform: 'lowercase', fontSize: 'var(--font-12)', fontWeight: 700 }
const addStatusColumnStyle: React.CSSProperties = { border: '1px dashed var(--panel-border)', borderRadius: 16, background: 'var(--form-bg)', padding: 12, flex: `0 0 ${BOARD_COLUMN_WIDTH}px`, width: BOARD_COLUMN_WIDTH, minWidth: BOARD_COLUMN_WIDTH, alignSelf: 'start', boxSizing: 'border-box' }
const addStatusButton: React.CSSProperties = { background: '#34d399', color: '#052e16', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 800, cursor: 'pointer' }

function statusGroupTextStyle(color?: string | null): React.CSSProperties {
  const pair = resolveStatusPair(color)
  return {
    color: pair ? 'var(--status-lane-border)' : 'var(--text-primary)',
    fontWeight: 800,
    fontSize: 'var(--font-14)',
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

function boardColumnStyle(): React.CSSProperties {
  const border = 'var(--status-lane-border, var(--panel-border))'
  return {
    background: `color-mix(in srgb, ${border} var(--status-lane-bg-strength), var(--panel-bg))`,
    border: `1px solid ${border}`,
    borderRadius: 16,
    padding: 12,
    boxShadow: `0 10px 24px color-mix(in srgb, ${border} 12%, transparent)`,
    flex: `0 0 ${BOARD_COLUMN_WIDTH}px`,
    width: BOARD_COLUMN_WIDTH,
    minWidth: BOARD_COLUMN_WIDTH,
    overflow: 'hidden',
  }
}

function boardCardStyle(color?: string | null): React.CSSProperties {
  const pair = resolveStatusPair(color)
  const border = pair ? 'var(--status-lane-border)' : 'var(--form-border)'
  return {
    border: `1px solid ${border}`,
    boxShadow: `0 10px 24px color-mix(in srgb, ${border} 16%, transparent)`,
  }
}
