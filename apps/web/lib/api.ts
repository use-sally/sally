import type { BoardColumn, Client, Health, Project, ProjectDetail, ProjectsSummary, ProjectTaskListItem, TaskDetail, TimesheetEntry, TimesheetReport, TimesheetSummary } from '@automatethis-pm/types/src'

const API_BASE_URL = 'http://localhost:4000'

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `Failed to fetch ${path} (${res.status})`)
  }
  return res.json()
}

export function getHealth(): Promise<Health> { return getJson('/health') }
export function getProjectsSummary(): Promise<ProjectsSummary> { return getJson('/projects/summary') }
export function getProjects(): Promise<Project[]> { return getJson('/projects') }
export function getProject(projectId: string): Promise<ProjectDetail> { return getJson(`/projects/${projectId}`) }
export function updateProject(projectId: string, payload: { name?: string; description?: string; clientId?: string | null }): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function getClients(): Promise<Client[]> { return getJson('/clients') }
export function createClient(payload: { name: string; notes?: string }): Promise<{ ok: boolean; clientId: string; existing?: boolean }> { return getJson('/clients', { method: 'POST', body: JSON.stringify(payload) }) }
export function createProjectStatus(projectId: string, payload: { name: string }): Promise<{ ok: boolean; statusId: string }> { return getJson(`/projects/${projectId}/statuses`, { method: 'POST', body: JSON.stringify(payload) }) }
export function updateProjectStatus(projectId: string, statusId: string, payload: { name?: string }): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}/statuses/${statusId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteProjectStatus(projectId: string, statusId: string, payload?: { targetStatusId?: string }): Promise<{ ok: boolean }> { return getJson(`/projects/${projectId}/statuses/${statusId}/delete`, { method: 'POST', body: JSON.stringify(payload || {}) }) }
export function getProjectTasks(projectId: string, filters?: { status?: string; assignee?: string; search?: string; label?: string }): Promise<ProjectTaskListItem[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.assignee) params.set('assignee', filters.assignee)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.label) params.set('label', filters.label)
  const q = params.toString()
  return getJson(`/projects/${projectId}/tasks${q ? `?${q}` : ''}`)
}
export function getTask(taskId: string): Promise<TaskDetail> { return getJson(`/tasks/${taskId}`) }
export function getBoard(projectId?: string): Promise<BoardColumn[]> {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return getJson(`/board${q}`)
}
export function getProjectTimesheets(projectId: string): Promise<{ summary: TimesheetSummary; entries: TimesheetEntry[] }> { return getJson(`/projects/${projectId}/timesheets`) }
export function getTaskTimesheets(taskId: string): Promise<{ summary: TimesheetSummary; entries: TimesheetEntry[] }> { return getJson(`/tasks/${taskId}/timesheets`) }
export function getTimesheetReport(filters?: { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; showValidated?: boolean }): Promise<TimesheetReport> {
  const params = new URLSearchParams()
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  if (filters?.projectId) params.set('projectId', filters.projectId)
  if (filters?.clientId) params.set('clientId', filters.clientId)
  if (filters?.taskId) params.set('taskId', filters.taskId)
  if (filters?.showValidated) params.set('showValidated', 'true')
  const q = params.toString()
  return getJson(`/timesheets/report${q ? `?${q}` : ''}`)
}
export function createTimesheetEntry(payload: { userName?: string; userId?: string; projectId: string; taskId?: string | null; date?: string; minutes: number; description?: string; billable?: boolean; validated?: boolean }): Promise<{ ok: boolean; timesheetId: string }> { return getJson('/timesheets', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTimesheetEntry(timesheetId: string, payload: { minutes?: number; description?: string | null; date?: string; billable?: boolean; validated?: boolean; taskId?: string | null }): Promise<{ ok: boolean }> {
  return getJson(`/timesheets/${timesheetId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}
export function deleteTimesheetEntry(timesheetId: string): Promise<{ ok: boolean }> { return getJson(`/timesheets/${timesheetId}`, { method: 'DELETE' }) }
export function createProject(payload: { name: string; description?: string; clientId?: string | null }): Promise<{ ok: boolean; projectId: string }> { return getJson('/projects', { method: 'POST', body: JSON.stringify(payload) }) }
export function moveTask(taskId: string, targetStatus: string): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/move`, { method: 'POST', body: JSON.stringify({ targetStatus }) }) }
export function reorderTask(payload: { taskId: string; targetStatusId: string; orderedTaskIds: string[] }): Promise<{ ok: boolean }> { return getJson('/tasks/reorder', { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTask(taskId: string, payload: { title?: string; description?: string; assignee?: string; priority?: 'P1'|'P2'|'P3'; dueDate?: string | null; statusId?: string }): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteTask(taskId: string): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}`, { method: 'DELETE' }) }
export function createTask(payload: { projectId: string; title: string; assignee?: string; description?: string; priority?: 'P1'|'P2'|'P3'; status?: string; statusId?: string; dueDate?: string | null; labels?: string[]; todos?: { text: string }[] }): Promise<{ ok: boolean; taskId: string }> { return getJson('/tasks', { method: 'POST', body: JSON.stringify(payload) }) }
export function createComment(taskId: string, payload: { body: string; author?: string }): Promise<{ ok: boolean; commentId: string }> { return getJson(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify(payload) }) }
export function createProjectLabel(projectId: string, payload: { name: string }): Promise<{ ok: boolean; labelId: string }> { return getJson(`/projects/${projectId}/labels`, { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTaskLabels(taskId: string, labels: string[]): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/labels`, { method: 'PATCH', body: JSON.stringify({ labels }) }) }
export function createTaskTodo(taskId: string, payload: { text: string }): Promise<{ ok: boolean; todoId: string }> { return getJson(`/tasks/${taskId}/todos`, { method: 'POST', body: JSON.stringify(payload) }) }
export function updateTaskTodo(taskId: string, todoId: string, payload: { text?: string; done?: boolean }): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/todos/${todoId}`, { method: 'PATCH', body: JSON.stringify(payload) }) }
export function deleteTaskTodo(taskId: string, todoId: string): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/todos/${todoId}/delete`, { method: 'POST', body: JSON.stringify({}) }) }
export function reorderTaskTodos(taskId: string, orderedTodoIds: string[]): Promise<{ ok: boolean }> { return getJson(`/tasks/${taskId}/todos/reorder`, { method: 'POST', body: JSON.stringify({ orderedTodoIds }) }) }
export function uploadTaskDescriptionImage(taskId: string, payload: { fileName?: string; mimeType?: string; base64: string }): Promise<{ ok: boolean; url: string }> { return getJson(`/tasks/${taskId}/image-upload`, { method: 'POST', body: JSON.stringify(payload) }) }
export function apiUrl(path: string): string { return `${API_BASE_URL}${path}` }
