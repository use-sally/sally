'use client'

import type { TimesheetReportEntry } from '@automatethis-pm/types/src'
import { useProjectTasksQuery } from '../lib/query'

const filterInputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 10, padding: '8px 10px', background: '#fff', fontSize: 14 }
const cellInputStyle: React.CSSProperties = { width: '100%', border: '1px solid #0f172a', borderRadius: 8, padding: '6px 8px', background: '#fff', fontSize: 14 }

export type EditableField = 'date' | 'minutes' | 'billable' | 'taskId' | 'description'
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
  newBusy,
  lockedProjectId,
  lockedProjectName,
  projectId,
  projects,
  showCustomerColumn,
  showProjectColumn,
  showUserColumn,
  showTaskColumn,
  showValidationColumn,
  onDateChange,
  onMinutesChange,
  onBillableChange,
  onTaskIdChange,
  onDescriptionChange,
  onValidatedChange,
  onProjectChange,
  onSubmit,
}: {
  gridColumns: string
  newDate: string
  newMinutes: string
  newBillable: boolean
  newTaskId: string
  newDescription: string
  taskOptions: { id: string; title: string }[]
  newValidated: boolean
  newBusy: boolean
  lockedProjectId?: string
  lockedProjectName?: string
  projectId: string
  projects: { id: string; name: string }[]
  showCustomerColumn: boolean
  showProjectColumn: boolean
  showUserColumn: boolean
  showTaskColumn: boolean
  showValidationColumn: boolean
  onDateChange: (value: string) => void
  onMinutesChange: (value: string) => void
  onBillableChange: (value: boolean) => void
  onTaskIdChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onValidatedChange: (value: boolean) => void
  onProjectChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, alignItems: 'center', padding: '12px 14px', background: '#fcfcfd', borderBottom: '1px solid #eef2f7' }}>
      <input type="date" value={newDate} onChange={(e) => onDateChange(e.target.value)} style={filterInputStyle} />
      {showCustomerColumn ? <div style={{ color: '#94a3b8' }}>—</div> : null}
      {showProjectColumn ? (
        lockedProjectId ? (
          <div style={{ color: '#475569', fontWeight: 600 }}>{lockedProjectName || projects.find((project) => project.id === projectId)?.name || 'Select project'}</div>
        ) : (
          <select value={projectId} onChange={(e) => onProjectChange(e.target.value)} style={filterInputStyle}>
            <option value="">Select project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        )
      ) : null}
      {showUserColumn ? <div style={{ color: '#475569', fontWeight: 600 }}>Alex</div> : null}
      <input value={newMinutes} onChange={(e) => onMinutesChange(e.target.value)} inputMode="numeric" placeholder="Minutes" style={filterInputStyle} />
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}><input type="checkbox" checked={newBillable} onChange={(e) => onBillableChange(e.target.checked)} /></label>
      {showTaskColumn ? (
        <select value={newTaskId} onChange={(e) => onTaskIdChange(e.target.value)} style={filterInputStyle}>
          <option value="">Project only</option>
          {taskOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
      ) : null}
      <input value={newDescription} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="What was done" style={filterInputStyle} />
      {showValidationColumn ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><input type="checkbox" checked={newValidated} onChange={(e) => onValidatedChange(e.target.checked)} /></div> : null}
      <button type="submit" disabled={newBusy || !newMinutes || !newDate || (!lockedProjectId && !projectId)} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>{newBusy ? 'Saving…' : 'Add'}</button>
    </form>
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
  activeField: EditableField | null
  draftValue: string | boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  isBusy: boolean
  onStartEdit: (field: EditableField) => void
  onDraftValueChange: (value: string | boolean) => void
  onSave: (field: EditableField) => void
  onToggleValidated: (value: boolean) => void
  onDelete: () => void
}) {
  const { data: projectTasks = [] } = useProjectTasksQuery(entry.projectId)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: 10, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #eef2f7', background: activeField ? '#f8fafc' : '#fff' }}>
      <div onClick={() => onStartEdit('date')} style={{ cursor: 'pointer' }}>
        {activeField === 'date' ? <input ref={inputRef} type="date" value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('date')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('date') } }} style={cellInputStyle} /> : String(entry.date).slice(0, 10)}
      </div>
      {showCustomerColumn ? <div>{entry.clientName || '—'}</div> : null}
      {showProjectColumn ? <div>{entry.projectName}</div> : null}
      {showUserColumn ? <div>{entry.userName}</div> : null}
      <div onClick={() => onStartEdit('minutes')} style={{ cursor: 'pointer' }}>
        {activeField === 'minutes' ? <input ref={inputRef} value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('minutes')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('minutes') } }} style={cellInputStyle} /> : entry.minutes}
      </div>
      <div onClick={() => onStartEdit('billable')} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
        {activeField === 'billable' ? <input ref={inputRef} type="checkbox" checked={Boolean(draftValue)} onChange={(e) => onDraftValueChange(e.target.checked)} onBlur={() => onSave('billable')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('billable') } }} /> : entry.billable ? 'Yes' : 'No'}
      </div>
      {showTaskColumn ? (
        <div onClick={() => onStartEdit('taskId')} style={{ cursor: 'pointer' }}>
          {activeField === 'taskId' ? (
            <select value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('taskId')} style={cellInputStyle}>
              <option value="">Project only</option>
              {projectTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          ) : entry.taskTitle || '—'}
        </div>
      ) : null}
      <div onClick={() => onStartEdit('description')} style={{ cursor: 'pointer' }}>
        {activeField === 'description' ? <input ref={inputRef} value={String(draftValue)} onChange={(e) => onDraftValueChange(e.target.value)} onBlur={() => onSave('description')} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSave('description') } }} style={cellInputStyle} /> : <div style={{ color: '#475569' }}>{entry.description || '—'}</div>}
      </div>
      {showValidationColumn ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><input type="checkbox" checked={entry.validated} onChange={(e) => onToggleValidated(e.target.checked)} /></div> : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={onDelete} disabled={isBusy} aria-label="Delete" title="Delete" style={{ border: 'none', background: 'transparent', cursor: 'pointer', opacity: isBusy ? 0.5 : 1, fontSize: 16, lineHeight: 1 }}>🗑️</button></div>
    </div>
  )
}
