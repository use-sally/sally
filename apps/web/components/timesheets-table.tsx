'use client'

import { useMemo, useState } from 'react'
import { useProjectTasksQuery } from '../lib/query'
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
    activeCell,
    draftValue,
    busyCell,
    newMinutes,
    newDate,
    newDescription,
    newBillable,
    newTaskId,
    newValidated,
    newBusy,
    inputRef,
    report,
    error,
    projects,
    clients,
    setFrom,
    setTo,
    setProjectId,
    setClientId,
    showValidated,
    setDraftValue,
    setShowValidated,
    setNewMinutes,
    setNewDate,
    setNewDescription,
    setNewBillable,
    setNewTaskId,
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
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const resolvedTaskOptions = (taskOptions.length ? taskOptions : selectedProjectTasks.map((task) => ({ id: task.id, title: task.title })))


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
    parts.push('100px', '100px')
    if (effectiveShowTaskColumn) parts.push('1.1fr')
    parts.push('1.8fr')
    if (effectiveShowValidationColumn) parts.push('72px')
    parts.push('84px')
    return parts.join(' ')
  }, [effectiveShowCustomerColumn, effectiveShowProjectColumn, effectiveShowUserColumn, effectiveShowTaskColumn, effectiveShowValidationColumn])

  function exportCsv() {
    const rows = [
      ['Date', 'Customer', 'Project', 'User', 'Minutes', 'Billable', 'Task', 'Description'],
      ...(report?.entries ?? []).map((entry) => [
        String(entry.date).slice(0, 10),
        entry.clientName || '',
        entry.projectName,
        entry.userName,
        String(entry.minutes),
        entry.billable ? 'yes' : 'no',
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
    <div style={{ display: 'grid', gap: 14 }}>
      <TimesheetsSummaryBar
        entries={report?.summary.entries ?? 0}
        totalMinutes={report?.summary.totalMinutes ?? 0}
        billableMinutes={report?.summary.billableMinutes ?? 0}
        onExport={exportCsv}
      />

      <TimesheetsFiltersBar
        from={from}
        to={to}
        projectId={projectId}
        clientId={clientId}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        lockedProjectId={lockedProjectId}
        onFromChange={setFrom}
        onToChange={setTo}
        onProjectChange={setProjectId}
        onClientChange={setClientId}
        showValidated={showValidated}
        onShowValidatedChange={setShowValidated}
      />


      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, alignItems: 'center', padding: '0 4px', color: '#64748b', fontSize: 13, fontWeight: 700 }}>
          <button onClick={() => toggleSort('date')} style={headerBtn(sortKey === 'date')}>Date{indicator('date')}</button>
          {effectiveShowCustomerColumn ? <button onClick={() => toggleSort('customer')} style={headerBtn(sortKey === 'customer')}>Customer{indicator('customer')}</button> : null}
          {effectiveShowProjectColumn ? <button onClick={() => toggleSort('project')} style={headerBtn(sortKey === 'project')}>Project{indicator('project')}</button> : null}
          {effectiveShowUserColumn ? <button onClick={() => toggleSort('user')} style={headerBtn(sortKey === 'user')}>User{indicator('user')}</button> : null}
          <button onClick={() => toggleSort('minutes')} style={headerBtn(sortKey === 'minutes')}>Minutes{indicator('minutes')}</button>
          <button onClick={() => toggleSort('billable')} style={headerBtn(sortKey === 'billable')}>Billable{indicator('billable')}</button>
          {effectiveShowTaskColumn ? <button onClick={() => toggleSort('task')} style={headerBtn(sortKey === 'task')}>Task{indicator('task')}</button> : null}
          <button onClick={() => toggleSort('description')} style={headerBtn(sortKey === 'description')}>Description{indicator('description')}</button>
          {effectiveShowValidationColumn ? <div>Validate</div> : null}
          <div></div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', background: '#fcfcfd' }}>
          <TimesheetsAddRow
          gridColumns={gridColumns}
          newDate={newDate}
          newMinutes={newMinutes}
          newBillable={newBillable}
          newTaskId={newTaskId}
          newDescription={newDescription}
          newValidated={newValidated}
          newBusy={newBusy}
          lockedProjectId={lockedProjectId}
          lockedProjectName={lockedProjectName}
          projectId={projectId}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
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
          onDescriptionChange={setNewDescription}
          onValidatedChange={setNewValidated}
          onProjectChange={setProjectId}
          onSubmit={() => void submitNewEntry()}
          />
        </div>

        {sortedEntries.length ? sortedEntries.map((entry) => {
          const activeField = activeCell?.entryId === entry.id ? activeCell.field : null
          const isBusy = busyCell?.entryId === entry.id
          return (
            <div key={entry.id} style={{ border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
              <TimesheetsEntryRow
              entry={entry}
              gridColumns={gridColumns}
              showCustomerColumn={effectiveShowCustomerColumn}
              showProjectColumn={effectiveShowProjectColumn}
              showUserColumn={effectiveShowUserColumn}
          showTaskColumn={effectiveShowTaskColumn}
          showValidationColumn={effectiveShowValidationColumn}
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
        }) : <div style={{ padding: 18, color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff' }}>{error ? (error instanceof Error ? error.message : 'Failed to load timesheets') : 'No timesheet entries match the current filters.'}</div>}
      </div>
    </div>
  )
}

function headerBtn(active: boolean): React.CSSProperties { return { background: 'transparent', border: 'none', textAlign: 'left', color: active ? '#0f172a' : '#64748b', fontSize: 13, fontWeight: active ? 800 : 700, padding: 0, cursor: 'pointer' } }
