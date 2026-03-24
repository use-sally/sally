import { useQuery } from '@tanstack/react-query'
import { getBoard, getClient, getClients, getHealth, getProject, getProjects, getProjectsSummary, getProjectTasks, getProjectTimesheets, getTask, getTaskTimesheets, getTimesheetReport, getTimesheetUsers } from './api'

export const qk = {
  health: ['health'] as const,
  projectsSummary: ['projectsSummary'] as const,
  projects: (archived?: boolean) => ['projects', archived ? '1' : '0'] as const,
  project: (projectId: string, archived?: boolean) => ['project', projectId, archived ? '1' : '0'] as const,
  projectTasks: (projectId: string, filters?: { status?: string; assignee?: string; search?: string; label?: string; archived?: boolean }) => ['projectTasks', projectId, filters?.status || '', filters?.assignee || '', filters?.search || '', filters?.label || '', filters?.archived ? '1' : '0'] as const,
  projectTimesheets: (projectId: string) => ['projectTimesheets', projectId] as const,
  board: (projectId: string) => ['board', projectId] as const,
  task: (taskId: string) => ['task', taskId] as const,
  taskTimesheets: (taskId: string) => ['taskTimesheets', taskId] as const,
  timesheetUsers: (projectId?: string) => ['timesheetUsers', projectId || ''] as const,
  timesheetReport: (filters?: { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; userId?: string; showValidated?: boolean }) => ['timesheetReport', filters?.from || '', filters?.to || '', filters?.projectId || '', filters?.clientId || '', filters?.taskId || '', filters?.userId || '', filters?.showValidated ? '1' : '0'] as const,
  clients: ['clients'] as const,
  client: (clientId: string) => ['client', clientId] as const,
}

export function useHealthQuery() { return useQuery({ queryKey: qk.health, queryFn: getHealth }) }
export function useProjectsSummaryQuery() { return useQuery({ queryKey: qk.projectsSummary, queryFn: getProjectsSummary }) }
export function useProjectsQuery(filters?: { archived?: boolean }) {
  return useQuery({ queryKey: qk.projects(filters?.archived), queryFn: () => getProjects(filters) })
}
export function useClientsQuery() { return useQuery({ queryKey: qk.clients, queryFn: getClients }) }
export function useClientQuery(clientId: string) { return useQuery({ queryKey: qk.client(clientId), queryFn: () => getClient(clientId), enabled: !!clientId }) }
export function useProjectQuery(projectId: string, options?: { archived?: boolean }) {
  return useQuery({ queryKey: qk.project(projectId, options?.archived), queryFn: () => getProject(projectId, options), enabled: !!projectId })
}
export function useProjectTasksQuery(projectId: string, filters?: { status?: string; assignee?: string; search?: string; label?: string; archived?: boolean }) {
  return useQuery({ queryKey: qk.projectTasks(projectId, filters), queryFn: () => getProjectTasks(projectId, filters), enabled: !!projectId })
}
export function useProjectTimesheetsQuery(projectId: string) { return useQuery({ queryKey: qk.projectTimesheets(projectId), queryFn: () => getProjectTimesheets(projectId), enabled: !!projectId }) }
export function useBoardQuery(projectId: string) { return useQuery({ queryKey: qk.board(projectId), queryFn: () => getBoard(projectId), enabled: !!projectId }) }
export function useTaskQuery(taskId: string) { return useQuery({ queryKey: qk.task(taskId), queryFn: () => getTask(taskId), enabled: !!taskId }) }
export function useTaskTimesheetsQuery(taskId: string) { return useQuery({ queryKey: qk.taskTimesheets(taskId), queryFn: () => getTaskTimesheets(taskId), enabled: !!taskId }) }
export function useTimesheetUsersQuery(projectId?: string) {
  return useQuery({
    queryKey: qk.timesheetUsers(projectId),
    queryFn: () => getTimesheetUsers(projectId),
  })
}
export function useTimesheetReportQuery(filters?: { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; userId?: string; showValidated?: boolean }) {
  return useQuery({ queryKey: qk.timesheetReport(filters), queryFn: () => getTimesheetReport(filters) })
}
