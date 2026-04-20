'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TimesheetReportEntry } from '@sally/types/src'
import { loadSession } from '../lib/auth'
import { createTimesheetEntry, deleteTimesheetEntry, updateTimesheetEntry } from '../lib/api'
import { getPreferredTimesheetCreateUserId } from '../lib/timesheet-user-defaults'
import { qk, useClientsQuery, useProjectsQuery, useTimesheetReportQuery, useTimesheetUsersQuery } from '../lib/query'
import type { ActiveCell, EditableField } from './timesheets-table-rows'

export function useTimesheetsTable({ lockedProjectId, lockedTaskId }: { lockedProjectId?: string; lockedTaskId?: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [projectId, setProjectId] = useState(lockedProjectId || '')
  const [clientId, setClientId] = useState('')
  const [userId, setUserId] = useState('')
  const [taskId, setTaskId] = useState('')
  const [showValidated, setShowValidated] = useState(false)
  const [activeCell, setActiveCell] = useState<ActiveCell>(null)
  const [draftValue, setDraftValue] = useState<string | boolean>('')
  const [busyCell, setBusyCell] = useState<ActiveCell>(null)
  const [newMinutes, setNewMinutes] = useState('')
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newDescription, setNewDescription] = useState('')
  const [newBillable, setNewBillable] = useState(true)
  const [newTaskId, setNewTaskId] = useState('')
  const [newUserId, setNewUserId] = useState('')
  const [newValidated, setNewValidated] = useState(false)
  const [newEntryError, setNewEntryError] = useState<string | null>(null)
  const [newBusy, setNewBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    if (lockedProjectId) setProjectId(lockedProjectId)
  }, [lockedProjectId])

  useEffect(() => {
    if (!lockedTaskId) setTaskId('')
  }, [projectId, lockedTaskId])

  useEffect(() => {
    if (activeCell && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select()
    }
  }, [activeCell])

  const filters = useMemo(() => ({
    from: from || undefined,
    to: to || undefined,
    projectId: (lockedProjectId || projectId) || undefined,
    clientId: clientId || undefined,
    userId: userId || undefined,
    taskId: lockedTaskId || taskId || undefined,
    showValidated,
  }), [from, to, projectId, clientId, userId, taskId, showValidated, lockedProjectId, lockedTaskId])

  const { data: report, error } = useTimesheetReportQuery(filters)
  const { data: projects = [] } = useProjectsQuery()
  const { data: clients = [] } = useClientsQuery()
  const { data: users = [] } = useTimesheetUsersQuery(lockedProjectId || projectId || undefined)
  const session = useMemo(() => loadSession(), [])

  useEffect(() => {
    const preferredUserId = getPreferredTimesheetCreateUserId(users, session?.account)
    if (preferredUserId && newUserId !== preferredUserId) setNewUserId(preferredUserId)
  }, [users, session?.account, newUserId])

  useEffect(() => {
    if (!clientId || !projectId) return
    const selectedProject = projects.find((project) => project.id === projectId)
    if (selectedProject && selectedProject.client?.id !== clientId) setProjectId('')
  }, [clientId, projectId, projects])

  async function invalidate(entry?: TimesheetReportEntry) {
    const targetProjectId = entry?.projectId || lockedProjectId
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['timesheetReport'] }),
      targetProjectId ? qc.invalidateQueries({ queryKey: ['project', targetProjectId] }) : Promise.resolve(),
      targetProjectId ? qc.invalidateQueries({ queryKey: qk.projectTimesheets(targetProjectId) }) : Promise.resolve(),
      lockedTaskId ? qc.invalidateQueries({ queryKey: qk.task(lockedTaskId) }) : Promise.resolve(),
      lockedTaskId ? qc.invalidateQueries({ queryKey: qk.taskTimesheets(lockedTaskId) }) : Promise.resolve(),
    ])
  }

  function getEntry(entryId: string) {
    return report?.entries.find((entry) => entry.id === entryId) ?? null
  }

  function getFieldValue(entry: TimesheetReportEntry, field: EditableField): string | boolean {
    if (field === 'date') return String(entry.date).slice(0, 10)
    if (field === 'userId') return entry.userId
    if (field === 'minutes') return String(entry.minutes)
    if (field === 'billable') return entry.billable
    if (field === 'taskId') return entry.taskId ?? ''
    return entry.description ?? ''
  }

  function startCellEdit(entry: TimesheetReportEntry, field: EditableField) {
    if (busyCell || newBusy) return
    setActiveCell({ entryId: entry.id, field })
    setDraftValue(getFieldValue(entry, field))
  }

  function cancelCellEdit() {
    setActiveCell(null)
    setDraftValue('')
  }

  async function saveCell(cell: ActiveCell) {
    if (!cell) return
    const entry = getEntry(cell.entryId)
    if (!entry) {
      cancelCellEdit()
      return
    }

    let payload: Parameters<typeof updateTimesheetEntry>[1] | null = null
    if (cell.field === 'date') {
      const nextDate = String(draftValue || '').trim()
      if (!nextDate) return
      if (nextDate !== String(entry.date).slice(0, 10)) payload = { date: nextDate }
    } else if (cell.field === 'userId') {
      const nextUserId = String(draftValue || '').trim()
      if (nextUserId && nextUserId !== entry.userId) payload = { userId: nextUserId }
    } else if (cell.field === 'minutes') {
      const minutes = Math.round(Number(draftValue))
      if (!minutes || minutes <= 0) return
      if (minutes !== entry.minutes) payload = { minutes }
    } else if (cell.field === 'billable') {
      const billable = Boolean(draftValue)
      if (billable !== entry.billable) payload = { billable }
    } else if (cell.field === 'taskId') {
      const taskId = String(draftValue || '').trim()
      if (taskId !== (entry.taskId ?? '')) payload = { taskId: taskId || null }
    } else if (cell.field === 'description') {
      const description = String(draftValue || '').trim()
      const original = entry.description ?? ''
      if (description !== original) payload = { description: description || null }
    }

    if (!payload) {
      cancelCellEdit()
      return
    }

    setBusyCell(cell)
    try {
      await updateTimesheetEntry(entry.id, payload)
      await invalidate(entry)
      cancelCellEdit()
    } finally {
      setBusyCell(null)
    }
  }

  async function submitNewEntry() {
    const minutes = Number(newMinutes)
    const nextProjectId = lockedProjectId || projectId
    setNewEntryError(null)
    if (!nextProjectId) {
      setNewEntryError('Select a project first.')
      return
    }
    if (!newDate) {
      setNewEntryError('Date is required.')
      return
    }
    if (!newMinutes.trim() || !minutes || minutes <= 0) {
      setNewEntryError('Minutes are required.')
      return
    }
    setNewBusy(true)
    try {
      await createTimesheetEntry({
        projectId: nextProjectId,
        minutes,
        date: newDate,
        description: newDescription.trim() || undefined,
        billable: newBillable,
        validated: newValidated,
        taskId: lockedTaskId || newTaskId.trim() || undefined,
        userId: newUserId || undefined,
      })
      setNewMinutes('')
      setNewDescription('')
      setNewTaskId('')
      setNewValidated(false)
      setNewEntryError(null)
      await invalidate()
    } finally {
      setNewBusy(false)
    }
  }


  async function toggleValidated(entry: TimesheetReportEntry, validated: boolean) {
    if (busyCell || newBusy) return
    setBusyCell({ entryId: entry.id, field: 'description' })
    try {
      await updateTimesheetEntry(entry.id, { validated })
      await invalidate(entry)
      if (activeCell?.entryId === entry.id) cancelCellEdit()
    } finally {
      setBusyCell(null)
    }
  }

  async function deleteEntry(entry: TimesheetReportEntry) {
    if (busyCell || newBusy) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this time entry?')) return
    setBusyCell({ entryId: entry.id, field: 'description' })
    try {
      await deleteTimesheetEntry(entry.id)
      await invalidate(entry)
      if (activeCell?.entryId === entry.id) cancelCellEdit()
    } finally {
      setBusyCell(null)
    }
  }

  return {
    from,
    to,
    projectId,
    clientId,
    userId,
    taskId,
    showValidated,
    activeCell,
    draftValue,
    busyCell,
    newMinutes,
    newDate,
    newDescription,
    newBillable,
    newTaskId,
    newUserId,
    newValidated,
    newEntryError,
    newBusy,
    inputRef,
    report,
    error,
    projects,
    clients,
    users,
    setFrom,
    setTo,
    setProjectId,
    setClientId,
    setUserId,
    setTaskId,
    setShowValidated,
    setDraftValue,
    setNewMinutes,
    setNewDate,
    setNewDescription,
    setNewBillable,
    setNewTaskId,
    setNewUserId,
    setNewValidated,
    startCellEdit,
    saveCell,
    submitNewEntry,
    toggleValidated,
    deleteEntry,
  }
}
