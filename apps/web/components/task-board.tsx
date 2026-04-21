'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, DragEndEvent, DragOverEvent, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BoardCard, BoardColumn } from '@sally/types/src'
import { createTask, reorderProjectStatuses, reorderTask } from '../lib/api'
import { qk } from '../lib/query'
import { pill, priorityStars, tagStyle } from './app-shell'
import { TaskPeopleField } from './task-people-field'
import { projectInputField, taskTitleText } from '../lib/theme'
import { resolveStatusPair, statusChipStyle, statusThemeVars } from '../lib/status-colors'

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

export function TaskBoard({ columns, taskBaseHref, projectId, canReorderStatuses = false }: { columns: BoardColumn[]; taskBaseHref?: string; projectId: string; canReorderStatuses?: boolean }) {
  const qc = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [board, setBoard] = useState<BoardColumn[]>(columns)

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
      <SortableContext items={movableColumns.map((column) => column.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(board.length, 1)}, minmax(0, 1fr))`, gap: 14 }}>
          {pinnedColumn ? <BoardColumnView key={pinnedColumn.id} column={pinnedColumn} taskBaseHref={taskBaseHref || ''} drafts={drafts} setDrafts={setDrafts} addInlineTask={addInlineTask} savingFor={savingFor} pinned /> : null}
          {movableColumns.map((column) => (
            <BoardColumnView key={column.id} column={column} taskBaseHref={taskBaseHref || ''} drafts={drafts} setDrafts={setDrafts} addInlineTask={addInlineTask} savingFor={savingFor} reorderable={canReorderStatuses} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function BoardColumnView({ column, taskBaseHref, drafts, setDrafts, addInlineTask, savingFor, reorderable = false, pinned = false }: any) {
  const { setNodeRef } = useDroppable({ id: column.id })
  const sortable = useSortable({ id: column.id, disabled: !reorderable })

  return (
    <div ref={(node) => { setNodeRef(node); sortable.setNodeRef(node) }} style={{ ...boardColumnStyle(column.color), ...statusThemeVars(column.color), transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {reorderable ? <button type="button" {...sortable.attributes} {...sortable.listeners} aria-label={`Reorder ${column.title}`} style={boardDragHandle}>⋮⋮</button> : null}
          <div style={{ ...statusChipStyle(column.color), background: 'var(--status-bg-light)', color: 'var(--status-text-light)', borderColor: 'var(--status-border-light)', borderRadius: 999, padding: '4px 10px', fontWeight: 700, fontSize: 14 }}>{column.title}</div>
          {pinned ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pinned</span> : null}
        </div>
        <div style={{ color: resolveStatusPair(column.color)?.darkText ?? 'var(--text-muted)', fontSize: 13 }}>{column.cards.length}</div>
      </div>

      <SortableContext items={column.cards.map((c: BoardCard) => c.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          {column.cards.map((card: BoardCard) => <SortableTaskCard key={card.id} card={card} taskBaseHref={taskBaseHref} projectId={column.projectId} />)}
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
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{savingFor === column.id ? 'Adding…' : 'Press Enter to create'}</div>
      </div>
    </div>
  )
}

function SortableTaskCard({ card, taskBaseHref, projectId }: { card: BoardCard; taskBaseHref: string; projectId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const badge = dueBadge(card.dueDate)

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, minWidth: 0 }}>
      <div style={{ ...boardCardStyle(card.statusColor), color: 'var(--form-text)', background: 'var(--form-bg)', borderRadius: 12, border: '1px solid var(--form-border)', padding: 12, display: 'grid', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        <Link href={`${taskBaseHref}?task=${card.id}`} style={{ textAlign: 'left', textDecoration: 'none', color: 'inherit', display: 'block', minWidth: 0 }}>
          <div {...attributes} {...listeners} style={{ cursor: 'grab', minWidth: 0 }}>
            <div style={{ ...taskTitleText, fontWeight: 600, lineHeight: 1.35, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{card.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginRight: 6 }}>#{card.number}</span> : null}{card.title}</div>
          </div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <TaskPeopleField projectId={projectId} taskId={card.id} owner={card.owner} ownerAvatarUrl={card.ownerAvatarUrl} participants={card.participants} assignee={card.assignee} assigneeAvatarUrl={card.assigneeAvatarUrl} collaborators={card.collaborators} compact />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ color: 'var(--text-primary)' }}>{priorityStars(card.priority)}</span>
            <span className="status-chip" style={statusChipStyle(card.statusColor)}>{card.status}</span>
          </div>
        </div>
        {card.labels?.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{card.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}</div> : null}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {card.todoProgress ? <span style={pill('#ecfeff', '#155e75')}>Todos {card.todoProgress}</span> : null}
          {badge ? <span style={pill(badge.bg, badge.color)}>{badge.label}</span> : null}
        </div>
      </div>
    </div>
  )
}

const boardInput: React.CSSProperties = { ...projectInputField, padding: '10px 12px' }
const boardDragHandle: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'grab', fontSize: 18, lineHeight: 1, padding: 2 }

function boardColumnStyle(color?: string | null): React.CSSProperties {
  const pair = resolveStatusPair(color)
  const border = pair?.darkText ?? 'var(--panel-border)'
  return {
    background: 'var(--panel-bg)',
    border: `1px solid ${border}`,
    borderRadius: 16,
    padding: 12,
    boxShadow: `0 10px 24px color-mix(in srgb, ${border} 12%, transparent)`,
    minWidth: 0,
    overflow: 'hidden',
  }
}

function boardCardStyle(color?: string | null): React.CSSProperties {
  const pair = resolveStatusPair(color)
  const border = pair?.darkText ?? 'var(--form-border)'
  return {
    border: `1px solid ${border}`,
    boxShadow: `0 10px 24px color-mix(in srgb, ${border} 16%, transparent)`,
  }
}
