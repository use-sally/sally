import { useQuery } from '@tanstack/react-query'
import { getBoard, getClients, getHealth, getProject, getProjects, getProjectsSummary, getProjectTasks, getProjectTimesheets, getTask, getTaskTimesheets, getTimesheetReport } from './api'

export const qk = {
  health: ['health'] as const,
  projectsSummary: ['projectsSummary'] as const,
  projects: ['projects'] as const,
  project: (projectId: string) => ['project', projectId] as const,
  projectTasks: (projectId: string, filters?: { status?: string; assignee?: string; search?: string; label?: string }) => ['projectTasks', projectId, filters?.status || '', filters?.assignee || '', filters?.search || '', filters?.label || ''] as const,
  projectTimesheets: (projectId: string) => ['projectTimesheets', projectId] as const,
  board: (projectId: string) => ['board', projectId] as const,
  task: (taskId: string) => ['task', taskId] as const,
  taskTimesheets: (taskId: string) => ['taskTimesheets', taskId] as const,
  timesheetReport: (filters?: { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; showValidated?: boolean }) => ['timesheetReport', filters?.from || '', filters?.to || '', filters?.projectId || '', filters?.clientId || '', filters?.taskId || '', filters?.showValidated ? '1' : '0'] as const,
  clients: ['clients'] as const,
}

export function useHealthQuery() { return useQuery({ queryKey: qk.health, queryFn: getHealth }) }
export function useProjectsSummaryQuery() { return useQuery({ queryKey: qk.projectsSummary, queryFn: getProjectsSummary }) }
export function useProjectsQuery() { return useQuery({ queryKey: qk.projects, queryFn: getProjects }) }
export function useClientsQuery() { return useQuery({ queryKey: qk.clients, queryFn: getClients }) }
export function useProjectQuery(projectId: string) { return useQuery({ queryKey: qk.project(projectId), queryFn: () => getProject(projectId), enabled: !!projectId }) }
export function useProjectTasksQuery(projectId: string, filters?: { status?: string; assignee?: string; search?: string; label?: string }) {
  return useQuery({ queryKey: qk.projectTasks(projectId, filters), queryFn: () => getProjectTasks(projectId, filters), enabled: !!projectId })
}
export function useProjectTimesheetsQuery(projectId: string) { return useQuery({ queryKey: qk.projectTimesheets(projectId), queryFn: () => getProjectTimesheets(projectId), enabled: !!projectId }) }
export function useBoardQuery(projectId: string) { return useQuery({ queryKey: qk.board(projectId), queryFn: () => getBoard(projectId), enabled: !!projectId }) }
export function useTaskQuery(taskId: string) { return useQuery({ queryKey: qk.task(taskId), queryFn: () => getTask(taskId), enabled: !!taskId }) }
export function useTaskTimesheetsQuery(taskId: string) { return useQuery({ queryKey: qk.taskTimesheets(taskId), queryFn: () => getTaskTimesheets(taskId), enabled: !!taskId }) }
export function useTimesheetReportQuery(filters?: { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; showValidated?: boolean }) {
  return useQuery({ queryKey: qk.timesheetReport(filters), queryFn: () => getTimesheetReport(filters) })
}
