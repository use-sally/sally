'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, DragEndEvent, DragOverEvent, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BoardCard, BoardColumn } from '@automatethis-pm/types/src'
import { createTask, reorderTask } from '../lib/api'
import { qk } from '../lib/query'
import { pill, priorityStars, tagStyle } from './app-shell'

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

export function TaskBoard({ columns, taskBaseHref, projectId }: { columns: BoardColumn[]; taskBaseHref?: string; projectId: string }) {
  const qc = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [board, setBoard] = useState<BoardColumn[]>(columns)

  useEffect(() => setBoard(columns), [columns])

  async function invalidateBoard() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.project(projectId) }),
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId), exact: false }),
      qc.invalidateQueries({ queryKey: qk.projects }),
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

  function onDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId) return

    const activeCol = findColumnByTaskId(activeId)
    const overCol = findColumnById(overId) || findColumnByTaskId(overId)
    if (!activeCol || !overCol) return
    if (activeCol.id === overCol.id) return

    setBoard((prev) => {
      const source = prev.find((c) => c.id === activeCol.id)!
      const target = prev.find((c) => c.id === overCol.id)!
      const moving = source.cards.find((c) => c.id === activeId)
      if (!moving) return prev
      return prev.map((col) => {
        if (col.id === source.id) return { ...col, cards: col.cards.filter((c) => c.id !== activeId) }
        if (col.id === target.id) return { ...col, cards: [...col.cards, { ...moving, status: target.title, statusId: target.id }] }
        return col
      })
    })
  }

  async function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId) return

    const activeCol = board.find((col) => col.cards.some((card) => card.id === activeId))
    const overCol = findColumnById(overId) || board.find((col) => col.cards.some((card) => card.id === overId))
    if (!activeCol || !overCol) return

    let nextBoard = board
    if (activeCol.id === overCol.id) {
      const col = activeCol
      const oldIndex = col.cards.findIndex((c) => c.id === activeId)
      const newIndex = overCol.cards.findIndex((c) => c.id === overId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        nextBoard = board.map((c) => c.id === col.id ? { ...c, cards: arrayMove(c.cards, oldIndex, newIndex) } : c)
        setBoard(nextBoard)
      }
    } else {
      nextBoard = board
      setBoard((prev) => [...prev])
    }

    await persistMove(activeId, overCol.id, nextBoard)
  }

  return (
    <DndContext sensors={sensors} onDragOver={onDragOver} onDragEnd={(e) => { void onDragEnd(e) }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(board.length, 1)}, minmax(0, 1fr))`, gap: 14 }}>
        {board.map((column) => (
          <BoardColumnView key={column.id} column={column} taskBaseHref={taskBaseHref || ''} drafts={drafts} setDrafts={setDrafts} addInlineTask={addInlineTask} savingFor={savingFor} />
        ))}
      </div>
    </DndContext>
  )
}

function BoardColumnView({ column, taskBaseHref, drafts, setDrafts, addInlineTask, savingFor }: any) {
  const { setNodeRef } = useDroppable({ id: column.id })
  return (
    <div ref={setNodeRef} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{column.title}</div>
        <div style={{ color: '#64748b', fontSize: 13 }}>{column.cards.length}</div>
      </div>

      <SortableContext items={column.cards.map((c: BoardCard) => c.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          {column.cards.map((card: BoardCard) => <SortableTaskCard key={card.id} card={card} taskBaseHref={taskBaseHref} />)}
        </div>
      </SortableContext>

      <div style={{ display: 'grid', gap: 6 }}>
        <input
          value={drafts[column.id] || ''}
          onChange={(e) => setDrafts((d: any) => ({ ...d, [column.id]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') void addInlineTask(column.id) }}
          placeholder={`Add to ${column.title}`}
          style={{ width: '100%', border: '1px solid #dbe1ea', borderRadius: 10, padding: '10px 12px', background: '#fff' }}
        />
        <div style={{ color: '#64748b', fontSize: 12 }}>{savingFor === column.id ? 'Adding…' : 'Press Enter to create'}</div>
      </div>
    </div>
  )
}

function SortableTaskCard({ card, taskBaseHref }: { card: BoardCard; taskBaseHref: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const badge = dueBadge(card.dueDate)
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
      <Link href={`${taskBaseHref}?task=${card.id}`} style={{ textAlign: 'left', textDecoration: 'none', color: '#0f172a', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 12, display: 'block' }}>
        <div {...attributes} {...listeners} style={{ cursor: 'grab' }}>
          <div style={{ fontWeight: 600, lineHeight: 1.35 }}>{card.title}</div>
          <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>{card.assignee} · <span style={{ color: '#0f172a' }}>{priorityStars(card.priority)}</span></div>
          {card.labels?.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{card.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}</div> : null}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {card.todoProgress ? <span style={pill('#ecfeff', '#155e75')}>Todos {card.todoProgress}</span> : null}
            {badge ? <span style={pill(badge.bg, badge.color)}>{badge.label}</span> : null}
          </div>
        </div>
      </Link>
    </div>
  )
}
