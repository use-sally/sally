'use client'

import type { TimesheetReportEntry } from '@sally/types/src'
import { useProjectTasksQuery } from '../lib/query'
import { deleteTextAction, formControlCell, formControlSm } from '../lib/theme'

const filterInputStyle: React.CSSProperties = formControlSm
const cellInputStyle: React.CSSProperties = { ...formControlCell, margin: 0, minHeight: 32, height: 32, fontSize: 14 }
const rowCellStyle: React.CSSProperties = { minHeight: 32, display: 'flex', alignItems: 'center', fontSize: 14 }

export type EditableField = 'date' | 'userId' | 'minutes' | 'billable' | 'taskId' | 'description'
export type ActiveCell = { entryId: string; field: EditableField } | null

export function TimesheetsAddRow({
  gridColumns,
  newDate,
  newMinutes,
  newBillable,
  newTaskId,
  newDescription,
  taskOptions,
  newValidated,
  newEntryError,
  newBusy,
  newUserId,
  lockedProjectId,
  lockedProjectName,
  projectId,
  projects,
  users,
  showCustomerColumn,
  showProjectColumn,
  showUserColumn,
  showTaskColumn,
  showValidationColumn,
  onDateChange,
  onMinutesChange,
  onBillableChange,
  onTaskIdChange,
  onUserChange,
  onDescriptionChange,
  onValidatedChange,
  onProjectChange,
  onSubmit,
  compact = false,
  canManage = true,
  forceUserId,
}: {
  gridColumns: string
  newDate: string
  newMinutes: string
  newBillable: boolean
  newTaskId: string
  newDescription: string
  taskOptions: { id: string; title: string }[]
  newValidated: boolean
  newEntryError: string | null
  newBusy: boolean
  newUserId: string
  lockedProjectId?: string
  lockedProjectName?: string
  projectId: string
  projects: { id: string; name: string }[]
  users: { id: string; name: string }[]
  showCustomerColumn: boolean
  showProjectColumn: boolean
  showUserColumn: boolean
  showTaskColumn: boolean
  showValidationColumn: boolean
  onDateChange: (value: string) => void
  onMinutesChange: (value: string) => void
  onBillableChange: (value: boolean) => void
  onTaskIdChange: (value: string) => void
  onUserChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onValidatedChange: (value: boolean) => void
  onProjectChange: (value: string) => void
  onSubmit: () => void
  compact?: boolean
  canManage?: boolean
  forceUserId?: string
}) {
  const handleEnterSubmit = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    onSubmit()
  }

  if (compact) {
    return (
      <div style={{ display: 'grid', gap: 4, padding: 0, background: 'transparent', borderBottom: 'none' }}>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} style={{ display: 'grid', gridTemplateColumns: '132px 96px minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center' }}>
          <input type="date" value={newDate} onChange={(e) => onDateChange(e.target.value)} onKeyDown={handleEnterSubmit} style={filterInputStyle} disabled={!canManage} />
          <input value={newMinutes} onChange={(e) => onMinutesChange(e.target.value)} onKeyDown={handleEnterSubmit} inputMode="numeric" placeholder="Minutes" style={filterInputStyle} disabled={!canManage} />
          <input value={newDescription} onChange={(e) => onDescriptionChange(e.target.value)} onKeyDown={handleEnterSubmit} placeholder="What was done" style={filterInputStyle} disabled={!canManage} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, color: 'var(--text-muted)', fontSize: 12 }}><input type="checkbox" checked={newBillable} onChange={(e) => onBillableChange(e.target.checked)} disabled={!canManage} /> Billable</label>
          <button type="submit" disabled={!canManage || newBusy} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--form-border)', background: 'var(--form-bg)', color: 'var(--form-text)', cursor: 'pointer' }}>{newBusy ? 'Saving…' : 'Add'}</button>
        </form>
        {newEntryError ? <div style={{ color: 'var(--danger-text)', fontSize: 12 }}>{newEntryError}</div> : null}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 6, padding: '12px 14px', background: 'var(--panel-bg)', borderBottom: '1px solid var(--panel-border)' }}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, alignItems: 'center' }}>
      <input type="date" value={newDate} onChange={(e) => onDateChange(e.target.value)} onKeyDown={handleEnterSubmit} style={filterInputStyle} disabled={!canManage} />
      {showCustomerColumn ? <div style={{ color: 'var(--text-muted)' }}>—</div> : null}
      {showProjectColumn ? (
        lockedProjectId ? (
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{lockedProjectName || projects.find((project) => project.id === projectId)?.name || 'Select project'}</div>
        ) : (
          <select value={projectId} onChange={(e) => onProjectChange(e.target.value)} onKeyDown={handleEnterSubmit} style={filterInputStyle} disabled={!canManage}>
            <option value="">Select project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        )
      ) : null}
      {showUserColumn ? (
        users.length ? (
          <select value={forceUserId || newUserId} onChange={(e) => onUserChange(e.target.value)} onKeyDown={handleEnterSubmit} style={filterInputStyle} disabled={!canManage || !!forceUserId}>
            {users.filter((user) => !forceUserId || user.id === forceUserId).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        ) : (
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Alex</div>
        )
      ) : null}
      <input value={newMinutes} onChange={(e) => onMinutesChange(e.target.value)} onKeyDown={handleEnterSubmit} inputMode="numeric" placeholder="Minutes" style={filterInputStyle} disabled={!canManage} />
      {showTaskColumn ? (
        <select value={newTaskId} onChange={(e) => onTaskIdChange(e.target.value)} onKeyDown={handleEnterSubmit} style={filterInputStyle} disabled={!canManage}>
          <option value="">Project only</option>
          {taskOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
      ) : null}
      <input value={newDescription} onChange={(e) => onDescriptionChange(e.target.value)} onKeyDown={handleEnterSubmit} placeholder="What was done" style={filterInputStyle} disabled={!canManage} />
      {showValidationColumn ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><input type="checkbox" checked={newValidated} onChange={(e) => onValidatedChange(e.target.checked)} disabled={!canManage} /></div> : null}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}><input type="checkbox" checked={newBillable} onChange={(e) => onBillableChange(e.target.checked)} disabled={!canManage} /></label>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: 'var(--text-muted)', fontSize: 12 }}>{newBusy ? 'Saving…' : 'Press Enter'}</div>
      </form>
      {newEntryError ? <div style={{ color: 'var(--danger-text)', fontSize: 12 }}>{newEntryError}</div> : null}
    </div>
  )
}

export function TimesheetsEntryRow({
  entry,
  gridColumns,
  showCustomerColumn,
  showProjectColumn,
  showUserColumn,
  showTaskColumn,
  showValidationColumn,
  users,
  canEditUser,
  canEditEntry,
  canDeleteEntry,
  canValidateEntry,
  activeField,
  draftValue,
  inputRef,
  isBusy,
  onStartEdit,
  onDraftValueChange,
  onSave,
  onToggleValidated,
  onDelete,
}: {
  entry: TimesheetReportEntry
  gridColumns: string
  showCustomerColumn: boolean
  showProjectColumn: boolean
  showUserColumn: boolean
  showTaskColumn: boolean
  showValidationColumn: boolean
  users: { id: string; name: string }[]
  canEditUser: boolean
  canEditEntry: boolean
  canDeleteEntry: boolean
  canValidateEntry: boolean
  activeField: EditableField | null
  draftValue: string | boolean
  inputRef: React.RefObject<HTMLInputElement | HTMLSelectElement | null>
  isBusy: boolean
  onStartEdit: (field: EditableField) => void
  onDraftValueChange: (value: string | boolean) => void
  onSave: (field: EditableField) => void
  onToggleValidated: (value: boolean) => void
  onDelete: () => void
}) {
  const { data: projectTasks = [] } = useProjectTasksQuery(entry.projectId)
  const setInputRef = (node: HTMLInputElement | null) => {
    inputRef.current = node
  }
  const setSelectRef = (node: HTMLSelectElement | null) => {
    inputRef.current = node
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--panel-border)', background: activeField ? 'rgba(250, 204, 21, 0.06)' : 'var(--form-bg)' }}>
      <div onClick={() => { if (canEditEntry) onStartEdit('date') }} style={{ ...rowCellStyle, cursor: canEditEntry ? 'pointer' : 'default' }}>
        {activeField === 'date' && canEditEntry ? <input ref={setInputRef} type="date" value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('date')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('date') } }} style={cellInputStyle} /> : String(entry.date).slice(0, 10)}
      </div>
      {showCustomerColumn ? <div style={rowCellStyle}>{entry.clientName || '—'}</div> : null}
      {showProjectColumn ? <div style={rowCellStyle}>{entry.projectName}</div> : null}
      {showUserColumn ? (
        <div onClick={() => { if (canEditEntry && canEditUser) onStartEdit('userId') }} style={{ ...rowCellStyle, cursor: canEditEntry && canEditUser ? 'pointer' : 'default' }}>
          {activeField === 'userId' && canEditEntry && canEditUser ? (
            <select ref={setSelectRef} value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('userId')} style={cellInputStyle}>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          ) : entry.userName}
        </div>
      ) : null}
      <div onClick={() => { if (canEditEntry) onStartEdit('minutes') }} style={{ ...rowCellStyle, cursor: canEditEntry ? 'pointer' : 'default' }}>
        {activeField === 'minutes' && canEditEntry ? <input ref={setInputRef} value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('minutes')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('minutes') } }} style={cellInputStyle} /> : entry.minutes}
      </div>
      {showTaskColumn ? (
        <div onClick={() => { if (canEditEntry) onStartEdit('taskId') }} style={{ ...rowCellStyle, cursor: canEditEntry ? 'pointer' : 'default' }}>
          {activeField === 'taskId' && canEditEntry ? (
            <select ref={setSelectRef} value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('taskId')} style={cellInputStyle}>
              <option value="">Project only</option>
              {projectTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          ) : entry.taskTitle || '—'}
        </div>
      ) : null}
      <div onClick={() => { if (canEditEntry) onStartEdit('description') }} style={{ ...rowCellStyle, cursor: canEditEntry ? 'pointer' : 'default' }}>
        {activeField === 'description' && canEditEntry ? <input ref={setInputRef} value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('description')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('description') } }} style={cellInputStyle} /> : <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{entry.description || '—'}</div>}
      </div>
      {showValidationColumn ? <div style={{ ...rowCellStyle, justifyContent: 'center' }}><input type="checkbox" checked={entry.validated} onChange={(e) => onToggleValidated(e.target.checked)} disabled={!canValidateEntry} /></div> : null}
      <div onClick={() => { if (canEditEntry) onStartEdit('billable') }} style={{ ...rowCellStyle, cursor: canEditEntry ? 'pointer' : 'default', justifyContent: 'center' }}>
        {activeField === 'billable' && canEditEntry
          ? <input ref={setInputRef} type="checkbox" checked={Boolean(draftValue)} onChange={(e) => onDraftValueChange(e.target.checked)} onBlur={() => onSave('billable')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('billable') } }} />
          : <input type="checkbox" checked={entry.billable} readOnly tabIndex={-1} aria-label={entry.billable ? 'Billable' : 'Non-billable'} />}
      </div>
      <div style={{ ...rowCellStyle, justifyContent: 'flex-end' }}>{canDeleteEntry ? <button type="button" onClick={onDelete} disabled={isBusy || !canDeleteEntry} aria-label="Delete" title="Delete" style={{ ...deleteTextAction, opacity: isBusy ? 0.5 : 1 }}>Delete</button> : null}</div>
    </div>
  )
}
