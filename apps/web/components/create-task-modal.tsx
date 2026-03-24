'use client'

import { useMemo, useState } from 'react'
import { createTask } from '../lib/api'
import { tagStyle } from './app-shell'

type TaskModalProjectOption = { id: string; name: string }

export function CreateTaskModal({ projects, defaultProjectId, onClose, onCreated }: { projects: TaskModalProjectOption[]; defaultProjectId?: string; onClose: () => void; onCreated: () => Promise<void> | void }) {
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || '')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'P1'|'P2'|'P3'>('P2')
  const [dueDate, setDueDate] = useState('')
  const [labelsInput, setLabelsInput] = useState('')
  const [todosInput, setTodosInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedLabels = useMemo(() => Array.from(new Set(labelsInput.split(',').map((label) => label.trim()).filter(Boolean))), [labelsInput])
  const parsedTodos = useMemo(() => todosInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [todosInput])

  async function submit() {
    try {
      setSaving(true)
      setError(null)
      await createTask({
        projectId,
        title,
        assignee,
        description,
        priority,
        dueDate: dueDate || null,
        labels: parsedLabels,
        todos: parsedTodos.map((text) => ({ text })),
      })
      await onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 750 }}>New task</div>
          <button onClick={onClose} style={ghostBtn}>Close</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={field}><span>Project</span><select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={input}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label style={field}><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="Add task title" /></label>
          <label style={field}><span>Assignee</span><input value={assignee} onChange={(e) => setAssignee(e.target.value)} style={input} placeholder="Alex" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={field}>
              <span>Priority</span>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {[1, 2, 3].map((rating) => {
                  const value = rating === 3 ? 'P1' : rating === 2 ? 'P2' : 'P3'
                  const filled = (priority === 'P1' ? 3 : priority === 'P2' ? 2 : 1) >= rating
                  return (
                    <button
                      key={rating}
                      type="button"
                      aria-label={`Set priority to ${rating} star${rating === 1 ? '' : 's'}`}
                      onClick={() => setPriority(value)}
                      style={{ ...starIconBtn, color: filled ? '#f59e0b' : '#cbd5e1' }}
                    >
                      ★
                    </button>
                  )
                })}
              </div>
            </label>
            <label style={field}><span>Due date</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={input} /></label>
          </div>
          <label style={field}><span>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 100, resize: 'vertical' }} /></label>
          <label style={field}>
            <span>Labels</span>
            <input value={labelsInput} onChange={(e) => setLabelsInput(e.target.value)} style={input} placeholder="marketing, urgent, blocked" />
            <div style={hintText}>{parsedLabels.length ? `Will add ${parsedLabels.length} label${parsedLabels.length === 1 ? '' : 's'}.` : 'Comma-separated labels.'}</div>
            {parsedLabels.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{parsedLabels.map((label) => <span key={label} style={tagStyle()}>{label}</span>)}</div> : null}
          </label>
          <label style={field}>
            <span>Checklist</span>
            <textarea value={todosInput} onChange={(e) => setTodosInput(e.target.value)} style={{ ...input, minHeight: 110, resize: 'vertical' }} placeholder={"One item per line\nDraft outline\nReview copy\nShip"} />
            <div style={hintText}>{parsedTodos.length ? `Will create ${parsedTodos.length} checklist item${parsedTodos.length === 1 ? '' : 's'}.` : 'One checklist item per line.'}</div>
          </label>
        </div>
        {error ? <div style={{ color: '#991b1b', marginTop: 12 }}>{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button onClick={submit} style={primaryBtn} disabled={saving || !title.trim() || !projectId}>{saving ? 'Creating…' : 'Create task'}</button>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', display: 'grid', placeItems: 'center', padding: 24 }
const modal: React.CSSProperties = { width: '100%', maxWidth: 560, background: '#fff', borderRadius: 20, padding: 22, boxShadow: '0 20px 50px rgba(15,23,42,0.18)' }
const field: React.CSSProperties = { display: 'grid', gap: 6, fontWeight: 600, color: '#334155' }
const input: React.CSSProperties = { width: '100%', border: '1px solid #dbe1ea', borderRadius: 12, padding: '10px 12px', background: '#fff', fontWeight: 500 }
const hintText: React.CSSProperties = { color: '#64748b', fontSize: 12, fontWeight: 500 }
const starIconBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: '2px', fontSize: 24, cursor: 'pointer', lineHeight: 1 }
const primaryBtn: React.CSSProperties = { background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
const ghostBtn: React.CSSProperties = { background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
