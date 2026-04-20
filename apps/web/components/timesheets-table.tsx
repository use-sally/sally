'use client'

import { useEffect, useMemo, useState } from 'react'
import { getWorkspaceId, loadSession } from '../lib/auth'
import { getProjectMembers } from '../lib/api'
import { canAddTimesheet, canDeleteTimesheet, canEditTimesheet, canValidateTimesheet } from '../lib/timesheet-permissions'
import { findCurrentTimesheetUserId } from '../lib/timesheet-user-defaults'
import { useProjectTasksQuery } from '../lib/query'
import { sortableHeaderButton } from '../lib/theme'
import { TimesheetsFiltersBar, TimesheetsSummaryBar } from './timesheets-table-chrome'
import { TimesheetsAddRow, TimesheetsEntryRow } from './timesheets-table-rows'
import { useTimesheetsTable } from './use-timesheets-table'

type SortKey = 'date' | 'customer' | 'project' | 'user' | 'minutes' | 'billable' | 'task' | 'description'
type SortDir = 'asc' | 'desc'

export function TimesheetsTable({
  lockedProjectId,
  lockedTaskId,
  lockedProjectName,
  taskOptions = [],
  showProjectColumn,
  showCustomerColumn,
  showUserColumn = true,
  showTaskColumn,
  showValidationColumn,
}: {
  lockedProjectId?: string
  lockedTaskId?: string
  lockedProjectName?: string
  taskOptions?: { id: string; title: string }[]
  showProjectColumn?: boolean
  showCustomerColumn?: boolean
  showUserColumn?: boolean
  showTaskColumn?: boolean
  showValidationColumn?: boolean
}) {
  const {
    from,
    to,
    projectId,
    clientId,
    userId,
    taskId,
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
    showValidated,
    setDraftValue,
    setShowValidated,
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
  } = useTimesheetsTable({ lockedProjectId, lockedTaskId })

  const activeProjectId = lockedProjectId || projectId
  const { data: selectedProjectTasks = [] } = useProjectTasksQuery(activeProjectId || '')

  const effectiveShowProjectColumn = showProjectColumn ?? !lockedProjectId
  const effectiveShowCustomerColumn = showCustomerColumn ?? !lockedProjectId
  const effectiveShowUserColumn = showUserColumn
  const effectiveShowTaskColumn = showTaskColumn ?? !lockedTaskId
  const effectiveShowValidationColumn = showValidationColumn ?? !lockedTaskId
  const compactLockedTaskEntry = !!lockedTaskId
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [projectRoles, setProjectRoles] = useState<Record<string, string | null>>({})

  const resolvedTaskOptions = (taskOptions.length ? taskOptions : selectedProjectTasks.map((task) => ({ id: task.id, title: task.title })))
  const showTaskFilter = !!activeProjectId && !lockedTaskId

  const filteredProjects = useMemo(() => {
    if (!clientId) return projects
    return projects.filter((project) => project.client?.id === clientId)
  }, [projects, clientId])

  const session = useMemo(() => loadSession(), [])
  const workspaceId = getWorkspaceId()
  const workspaceRole = session?.memberships?.find((item) => item.workspaceId === workspaceId)?.role ?? session?.memberships?.[0]?.role ?? null

  useEffect(() => {
    if (!session?.account?.id) {
      setProjectRoles({})
      return
    }
    const candidateProjectIds = Array.from(new Set([
      ...(activeProjectId ? [activeProjectId] : []),
      ...((report?.entries ?? []).map((entry) => entry.projectId)),
    ].filter(Boolean)))
    if (!candidateProjectIds.length) {
      setProjectRoles({})
      return
    }
    let cancelled = false
    void Promise.all(candidateProjectIds.map(async (projectId) => {
      const members = await getProjectMembers(projectId)
      return [projectId, members.find((member) => member.accountId === session.account?.id)?.role ?? null] as const
    }))
      .then((pairs) => {
        if (!cancelled) setProjectRoles(Object.fromEntries(pairs))
      })
      .catch(() => {
        if (!cancelled) setProjectRoles({})
      })
    return () => { cancelled = true }
  }, [activeProjectId, report?.entries, session?.account?.id])

  const currentTimesheetUserId = findCurrentTimesheetUserId(users, session?.account)
  const activeViewer = { timesheetUserId: currentTimesheetUserId, platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole: activeProjectId ? (projectRoles[activeProjectId] ?? null) : null }
  const addDecision = canAddTimesheet(activeViewer)
  const validateDecision = canValidateTimesheet(activeViewer)
  const canEditTimesheetUser = validateDecision.allowed

  const sortedEntries = useMemo(() => {
    const entries = [...(report?.entries ?? [])]
    const dir = sortDir === 'asc' ? 1 : -1
    entries.sort((a, b) => {
      const av = sortKey === 'date' ? String(a.date)
        : sortKey === 'customer' ? (a.clientName || '')
        : sortKey === 'project' ? a.projectName
        : sortKey === 'user' ? a.userName
        : sortKey === 'minutes' ? a.minutes
        : sortKey === 'billable' ? Number(a.billable)
        : sortKey === 'task' ? (a.taskTitle || '')
        : (a.description || '')
      const bv = sortKey === 'date' ? String(b.date)
        : sortKey === 'customer' ? (b.clientName || '')
        : sortKey === 'project' ? b.projectName
        : sortKey === 'user' ? b.userName
        : sortKey === 'minutes' ? b.minutes
        : sortKey === 'billable' ? Number(b.billable)
        : sortKey === 'task' ? (b.taskTitle || '')
        : (b.description || '')
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
    return entries
  }, [report?.entries, sortKey, sortDir])

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(nextKey); setSortDir(nextKey === 'date' ? 'desc' : 'asc') }
  }

  function indicator(key: SortKey) { return sortKey !== key ? '' : sortDir === 'asc' ? ' ↑' : ' ↓' }

  const gridColumns = useMemo(() => {
    const parts = ['120px']
    if (effectiveShowCustomerColumn) parts.push('1.2fr')
    if (effectiveShowProjectColumn) parts.push('1.2fr')
    if (effectiveShowUserColumn) parts.push('0.9fr')
    parts.push('100px')
    if (effectiveShowTaskColumn) parts.push('1.1fr')
    parts.push('1.8fr')
    if (effectiveShowValidationColumn) parts.push('72px')
    parts.push('100px', '84px')
    return parts.join(' ')
  }, [effectiveShowCustomerColumn, effectiveShowProjectColumn, effectiveShowUserColumn, effectiveShowTaskColumn, effectiveShowValidationColumn])

  function exportCsv() {
    const rows = [
      ['Date', 'Customer', 'Project', 'User', 'Minutes', 'Billable', 'Validated', 'Task', 'Description'],
      ...(report?.entries ?? []).map((entry) => [
        String(entry.date).slice(0, 10),
        entry.clientName || '',
        entry.projectName,
        entry.userName,
        String(entry.minutes),
        entry.billable ? 'yes' : 'no',
        entry.validated ? 'yes' : 'no',
        entry.taskTitle || entry.taskId || '',
        (entry.description || '').replace(/\n/g, ' '),
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(lockedProjectName || 'timesheet-report').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-preserve-task-open="true" onMouseDown={(event) => event.stopPropagation()} style={{ display: 'grid', gap: 14 }}>
      <TimesheetsSummaryBar
        entries={report?.summary.entries ?? 0}
        totalMinutes={report?.summary.totalMinutes ?? 0}
        billableMinutes={report?.summary.billableMinutes ?? 0}
        onExport={exportCsv}
      />

      {!compactLockedTaskEntry ? (
        <TimesheetsFiltersBar
          from={from}
          to={to}
          projectId={projectId}
          clientId={clientId}
          userId={userId}
          taskId={taskId}
          projects={filteredProjects.map((project) => ({ id: project.id, name: project.name }))}
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          users={users.map((user) => ({ id: user.id, name: user.name }))}
          taskOptions={showTaskFilter ? resolvedTaskOptions : []}
          lockedProjectId={lockedProjectId}
          showTaskFilter={showTaskFilter}
          onFromChange={setFrom}
          onToChange={setTo}
          onProjectChange={setProjectId}
          onClientChange={setClientId}
          onUserChange={setUserId}
          onTaskChange={setTaskId}
          showValidated={showValidated}
          onShowValidatedChange={setShowValidated}
        />
      ) : null}


      <div style={{ display: 'grid', gap: 12 }}>
        <div style={compactLockedTaskEntry ? { overflow: 'visible', background: 'transparent' } : { border: '1px solid var(--panel-border)', borderRadius: 16, overflow: 'hidden', background: 'var(--panel-bg)' }}>
          <TimesheetsAddRow
          gridColumns={gridColumns}
          newDate={newDate}
          newMinutes={newMinutes}
          newBillable={newBillable}
          newTaskId={newTaskId}
          newDescription={newDescription}
          newValidated={newValidated}
          newEntryError={newEntryError}
          newBusy={newBusy}
          newUserId={newUserId}
          lockedProjectId={lockedProjectId}
          lockedProjectName={lockedProjectName}
          projectId={projectId}
          projects={filteredProjects.map((project) => ({ id: project.id, name: project.name }))}
          users={users.map((user) => ({ id: user.id, name: user.name }))}
          canManage={addDecision.allowed}
          forceUserId={!validateDecision.allowed ? (currentTimesheetUserId ?? '') : undefined}
          showCustomerColumn={effectiveShowCustomerColumn}
          showProjectColumn={effectiveShowProjectColumn}
          showUserColumn={effectiveShowUserColumn}
          showTaskColumn={effectiveShowTaskColumn}
          showValidationColumn={effectiveShowValidationColumn}
          onDateChange={setNewDate}
          onMinutesChange={setNewMinutes}
          onBillableChange={setNewBillable}
          taskOptions={resolvedTaskOptions}
          onTaskIdChange={setNewTaskId}
          onUserChange={setNewUserId}
          onDescriptionChange={setNewDescription}
          onValidatedChange={setNewValidated}
          onProjectChange={setProjectId}
          onSubmit={() => void submitNewEntry()}
          compact={compactLockedTaskEntry}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, alignItems: 'center', padding: '0 4px', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>
          <button onClick={() => toggleSort('date')} style={headerBtn(sortKey === 'date')}>Date{indicator('date')}</button>
          {effectiveShowCustomerColumn ? <button onClick={() => toggleSort('customer')} style={headerBtn(sortKey === 'customer')}>Customer{indicator('customer')}</button> : null}
          {effectiveShowProjectColumn ? <button onClick={() => toggleSort('project')} style={headerBtn(sortKey === 'project')}>Project{indicator('project')}</button> : null}
          {effectiveShowUserColumn ? <button onClick={() => toggleSort('user')} style={headerBtn(sortKey === 'user')}>User{indicator('user')}</button> : null}
          <button onClick={() => toggleSort('minutes')} style={headerBtn(sortKey === 'minutes')}>Minutes{indicator('minutes')}</button>
          {effectiveShowTaskColumn ? <button onClick={() => toggleSort('task')} style={headerBtn(sortKey === 'task')}>Task{indicator('task')}</button> : null}
          <button onClick={() => toggleSort('description')} style={headerBtn(sortKey === 'description')}>Description{indicator('description')}</button>
          {effectiveShowValidationColumn ? <div>Validate</div> : null}
          <button onClick={() => toggleSort('billable')} style={headerBtn(sortKey === 'billable')}>Billable{indicator('billable')}</button>
          <div></div>
        </div>

        {sortedEntries.length ? sortedEntries.map((entry) => {
          const activeField = activeCell?.entryId === entry.id ? activeCell.field : null
          const isBusy = busyCell?.entryId === entry.id
          return (
            <div key={entry.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 16, overflow: 'hidden', background: 'var(--form-bg)' }}>
              <TimesheetsEntryRow
              entry={entry}
              gridColumns={gridColumns}
              showCustomerColumn={effectiveShowCustomerColumn}
              showProjectColumn={effectiveShowProjectColumn}
              showUserColumn={effectiveShowUserColumn}
              showTaskColumn={effectiveShowTaskColumn}
              showValidationColumn={effectiveShowValidationColumn}
              users={users.map((user) => ({ id: user.id, name: user.name }))}
              canEditUser={canEditTimesheetUser}
              canEditEntry={canEditTimesheet({ timesheetUserId: currentTimesheetUserId, platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole: projectRoles[entry.projectId] ?? null }, { userId: entry.userId, validated: entry.validated }).allowed}
              canDeleteEntry={canDeleteTimesheet({ timesheetUserId: currentTimesheetUserId, platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole: projectRoles[entry.projectId] ?? null }, { userId: entry.userId, validated: entry.validated }).allowed}
              canValidateEntry={canValidateTimesheet({ timesheetUserId: currentTimesheetUserId, platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole: projectRoles[entry.projectId] ?? null }).allowed}
              activeField={activeField}
              draftValue={draftValue}
              inputRef={inputRef}
              isBusy={!!isBusy}
              onStartEdit={(field) => startCellEdit(entry, field)}
              onDraftValueChange={setDraftValue}
              onSave={(field) => void saveCell({ entryId: entry.id, field })}
              onToggleValidated={(validated) => void toggleValidated(entry, validated)}
              onDelete={() => void deleteEntry(entry)}
              />
            </div>
          )
        }) : <div style={{ padding: 18, color: 'var(--text-muted)', border: '1px solid var(--panel-border)', borderRadius: 16, background: 'var(--form-bg)' }}>{error ? (error instanceof Error ? error.message : 'Failed to load timesheets') : 'No timesheet entries match the current filters.'}</div>}
      </div>
    </div>
  )
}

function headerBtn(active: boolean): React.CSSProperties { return sortableHeaderButton(active) }
