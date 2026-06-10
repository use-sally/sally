export function workspaceProjectPath(workspaceId: string | null | undefined, projectId: string) {
  return workspaceId ? `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}` : `/projects/${encodeURIComponent(projectId)}`
}

export function workspaceProjectTaskPath(workspaceId: string | null | undefined, projectId: string, taskId: string) {
  return workspaceId
    ? `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`
    : `/tasks/${encodeURIComponent(taskId)}`
}
