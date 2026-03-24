'use client'

export function TimesheetsSummaryBar({
  entries,
  totalMinutes,
  billableMinutes,
  onExport,
}: {
  entries: number
  totalMinutes: number
  billableMinutes: number
  onExport: () => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div><div style={{ color: '#64748b', fontSize: 13 }}>Entries</div><div style={{ fontSize: 24, fontWeight: 750 }}>{entries}</div></div>
        <div><div style={{ color: '#64748b', fontSize: 13 }}>Total minutes</div><div style={{ fontSize: 24, fontWeight: 750 }}>{totalMinutes}</div></div>
        <div><div style={{ color: '#64748b', fontSize: 13 }}>Billable minutes</div><div style={{ fontSize: 24, fontWeight: 750 }}>{billableMinutes}</div></div>
      </div>
      <button onClick={onExport} style={{ background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 12px', fontWeight: 700 }}>Export CSV</button>
    </div>
  )
}

export function TimesheetsFiltersBar({
  from,
  to,
  projectId,
  clientId,
  userId,
  taskId,
  projects,
  clients,
  users,
  taskOptions,
  lockedProjectId,
  showTaskFilter,
  onFromChange,
  onToChange,
  onProjectChange,
  onClientChange,
  onUserChange,
  onTaskChange,
  showValidated,
  onShowValidatedChange,
}: {
  from: string
  to: string
  projectId: string
  clientId: string
  userId: string
  taskId: string
  projects: { id: string; name: string }[]
  clients: { id: string; name: string }[]
  users: { id: string; name: string }[]
  taskOptions: { id: string; title: string }[]
  lockedProjectId?: string
  showTaskFilter: boolean
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onProjectChange: (value: string) => void
  onClientChange: (value: string) => void
  onUserChange: (value: string) => void
  onTaskChange: (value: string) => void
  showValidated: boolean
  onShowValidatedChange: (value: boolean) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: lockedProjectId
        ? (showTaskFilter ? '180px 180px minmax(180px, 1fr) minmax(180px, 1fr) auto' : '180px 180px minmax(180px, 1fr) auto')
        : (showTaskFilter ? '180px 180px minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) auto' : '180px 180px minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) auto'), gap: 8, alignItems: 'center' }}>
        <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} style={inputStyle} />
        <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} style={inputStyle} />
        {!lockedProjectId ? <select value={projectId} onChange={(e) => onProjectChange(e.target.value)} style={inputStyle}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select> : null}
        {!lockedProjectId ? <select value={clientId} onChange={(e) => onClientChange(e.target.value)} style={inputStyle}><option value="">All customers</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select> : null}
        {showTaskFilter ? <select value={taskId} onChange={(e) => onTaskChange(e.target.value)} style={inputStyle}><option value="">All tasks</option>{taskOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select> : null}
        <select value={userId} onChange={(e) => onUserChange(e.target.value)} style={inputStyle}><option value="">All users</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 14, whiteSpace: 'nowrap', fontWeight: 600 }}><input type="checkbox" checked={showValidated} onChange={(e) => onShowValidatedChange(e.target.checked)} /> Show validated / restore</label>
      </div>
      <div style={{ color: '#64748b', fontSize: 12 }}>Validated entries are hidden by default. Turn this on to review them and uncheck validation to restore them.</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 10, padding: '8px 10px', background: '#fff', fontSize: 14 }
