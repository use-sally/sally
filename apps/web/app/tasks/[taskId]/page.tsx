'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { EditionInfo, MentionableUser, ProviderResource, TaskConnectedResource, TaskDetail } from '@sally/types/src'
import { AppShell, panel, priorityStars, tagStyle } from '../../../components/app-shell'
import { EnterpriseLockedCard } from '../../../components/enterprise-locked-card'
import { AssigneeAvatar } from '../../../components/assignee-avatar'
import { TaskPeopleAvatarStack } from '../../../components/task-people-avatar-stack'
import { MarkdownDescriptionEditor, renderMarkdownToHtml } from '../../../components/markdown-description-editor'
import { TaskDescriptionRender } from '../../../components/task-description-render'
import { getWorkspaceId, loadSession } from '../../../lib/auth'
import { createComment, createTaskResource, createTaskTodo, deleteTaskResource, deleteTaskTodo, getEdition, getMentionableUsers, getProjectMembers, getTask, searchIntegrationResources, updateTask, updateTaskLabels, updateTaskTodo, uploadTaskDescriptionImage } from '../../../lib/api'
import { canEditTask } from '../../../lib/task-permissions'
import { projectInputField } from '../../../lib/theme'

export default function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const [taskId, setTaskId] = useState('')
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projectRole, setProjectRole] = useState<string | null>(null)
  const [edition, setEdition] = useState<EditionInfo | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOptions, setMentionOptions] = useState<MentionableUser[]>([])
  const [mentionAnchor, setMentionAnchor] = useState<string | null>(null)
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({})
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [labelsDraft, setLabelsDraft] = useState('')
  const [newTodo, setNewTodo] = useState('')
  const [resourceProvider, setResourceProvider] = useState<TaskConnectedResource['provider']>('GOOGLE_DRIVE')
  const [resourceKind, setResourceKind] = useState<TaskConnectedResource['kind']>('LINK')
  const [resourceName, setResourceName] = useState('')
  const [resourceUrl, setResourceUrl] = useState('')
  const [resourceSearch, setResourceSearch] = useState('')
  const [microsoftSource, setMicrosoftSource] = useState<'onedrive' | 'sharepoint'>('onedrive')
  const [sharePointSiteId, setSharePointSiteId] = useState<string | null>(null)
  const [sharePointDriveId, setSharePointDriveId] = useState<string | null>(null)
  const [sharePointItemId, setSharePointItemId] = useState<string | null>(null)
  const [resourceResults, setResourceResults] = useState<ProviderResource[]>([])
  const [searchingResources, setSearchingResources] = useState(false)
  const [savingResource, setSavingResource] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)
  const session = useMemo(() => loadSession(), [])

  useEffect(() => {
    void params.then((p) => setTaskId(p.taskId))
  }, [params])

  useEffect(() => {
    if (!taskId) return
    void Promise.all([getTask(taskId), getEdition().catch(() => null)]).then(([loadedTask, editionInfo]) => { setTask(loadedTask); setEdition(editionInfo) }).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load task'))
  }, [taskId])

  useEffect(() => {
    if (!task) return
    setTitleDraft(task.title)
    setDescriptionDraft(task.description || '')
    setLabelsDraft((task.labels || []).join(', '))
  }, [task])

  useEffect(() => {
    if (!task?.project.id || !session?.account?.id) {
      setProjectRole(null)
      return
    }
    let cancelled = false
    void getProjectMembers(task.project.id)
      .then((members) => {
        if (!cancelled) setProjectRole(members.find((member) => member.accountId === session.account?.id)?.role ?? null)
      })
      .catch(() => {
        if (!cancelled) setProjectRole(null)
      })
    return () => { cancelled = true }
  }, [task?.project.id, session?.account?.id])

  useEffect(() => {
    if (!task?.project.id || !mentionQuery) {
      setMentionOptions([])
      return
    }
    let cancelled = false
    void getMentionableUsers(task.project.id, mentionQuery)
      .then((users) => { if (!cancelled) setMentionOptions(users) })
      .catch(() => { if (!cancelled) setMentionOptions([]) })
    return () => { cancelled = true }
  }, [mentionQuery, task?.project.id])

  const workspaceRole = session?.memberships?.find((membership) => membership.workspaceId === getWorkspaceId())?.role ?? null
  const taskEditDecision = canEditTask({ platformRole: session?.account?.platformRole ?? null, workspaceRole, projectRole }, false)
  const cloudStorageEnabled = Boolean(edition?.availableFeatures?.includes('integrations.cloudStorage'))

  const refreshTask = async () => {
    if (!taskId) return
    const updated = await getTask(taskId)
    setTask(updated)
  }

  const saveTaskField = async (patch: Record<string, unknown>, field: string) => {
    if (!task) return
    setSavingField(field)
    try {
      await updateTask(task.id, patch)
      await refreshTask()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task')
    } finally {
      setSavingField(null)
    }
  }

  const handleCommentChange = (value: string) => {
    setCommentBody(value)
    const match = value.match(/(^|\s)(@([a-zA-Z0-9._-]{0,30}))$/)
    if (!match) {
      setMentionAnchor(null)
      setMentionQuery('')
      setMentionOptions([])
      return
    }
    setMentionAnchor(match[2])
    setMentionQuery(match[3] || '')
  }

  const insertMention = (user: MentionableUser) => {
    if (!mentionAnchor) return
    const display = (user.name || user.email.split('@')[0]).replace(/\s+/g, '.').toLowerCase()
    setCommentBody((current) => current.replace(new RegExp(`${mentionAnchor}$`), `@${display} `))
    setMentionMap((current) => ({ ...current, [display]: user.accountId }))
    setMentionAnchor(null)
    setMentionQuery('')
    setMentionOptions([])
  }

  const handleAddResource = async () => {
    if (!task || !resourceUrl.trim()) return
    setSavingResource(true)
    try {
      await createTaskResource(task.id, { provider: resourceProvider, kind: resourceKind, name: resourceName.trim() || undefined, webUrl: resourceUrl.trim() })
      setResourceName('')
      setResourceUrl('')
      setResourceKind('LINK')
      await refreshTask()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect resource')
    } finally {
      setSavingResource(false)
    }
  }

  const handleSearchResources = async () => {
    setSearchingResources(true)
    setError(null)
    try {
      const response = await searchIntegrationResources(providerSlug(resourceProvider), resourceSearch.trim(), resourceProvider === 'MICROSOFT_365' && microsoftSource === 'sharepoint' ? { source: 'sharepoint', siteId: sharePointSiteId || undefined, driveId: sharePointDriveId || undefined, itemId: sharePointItemId || undefined } : undefined)
      setResourceResults(response.items)
    } catch (err) {
      setResourceResults([])
      setError(err instanceof Error ? err.message : 'Failed to search connected storage')
    } finally {
      setSearchingResources(false)
    }
  }

  const handleAttachProviderResource = async (resource: ProviderResource) => {
    if (!task) return
    const resourceType = typeof resource.metadata?.resourceType === 'string' ? resource.metadata.resourceType : ''
    if (resource.provider === 'MICROSOFT_365' && resourceType === 'SITE') {
      setSharePointSiteId(String(resource.metadata.siteId || resource.externalId))
      setSharePointDriveId(null)
      setSharePointItemId(null)
      setResourceSearch('')
      setResourceResults([])
      return
    }
    if (resource.provider === 'MICROSOFT_365' && resourceType === 'DRIVE') {
      setSharePointDriveId(String(resource.metadata.driveId || resource.externalId))
      setSharePointItemId(null)
      setResourceSearch('')
      setResourceResults([])
      return
    }
    setSavingResource(true)
    try {
      await createTaskResource(task.id, { provider: resource.provider, kind: resource.kind, externalId: resource.externalId, name: resource.name, webUrl: resource.webUrl, mimeType: resource.mimeType, metadata: resource.metadata })
      setResourceResults([])
      await refreshTask()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach provider resource')
    } finally {
      setSavingResource(false)
    }
  }

  const handleSubmitComment = async () => {
    if (!task) return
    const body = commentBody.trim()
    if (!body) return
    const mentionedIds = Object.entries(mentionMap).filter(([display]) => body.includes(`@${display}`)).map(([, accountId]) => accountId)
    setSubmittingComment(true)
    try {
      await createComment(task.id, { body, author: session?.account?.name || session?.account?.email, mentions: mentionedIds })
      await refreshTask()
      setCommentBody('')
      setMentionMap({})
      setMentionAnchor(null)
      setMentionQuery('')
      setMentionOptions([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment')
    } finally {
      setSubmittingComment(false)
    }
  }

  return (
    <AppShell
      title=""
      subtitle={task ? `${task.project.name} · ${task.status}` : 'Task detail'}
      actions={task ? <Link href={`/projects/${task.project.id}/board`} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', borderRadius: 12, padding: '11px 14px', fontWeight: 700, textDecoration: 'none' }}>Back to board</Link> : null}
    >
      <style>{`
        .comment-markdown blockquote {
          margin: 10px 0;
          padding: 9px 12px;
          border-left: 4px solid var(--form-border-focus);
          border-radius: 10px;
          background: color-mix(in srgb, var(--form-border-focus) 10%, transparent);
          color: var(--text-secondary);
        }
        .comment-markdown pre {
          margin: 10px 0;
          padding: 10px 12px;
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.78);
          color: #e5e7eb;
          overflow-x: auto;
        }
        .comment-markdown code {
          border-radius: 6px;
          padding: 2px 5px;
          background: rgba(15, 23, 42, 0.68);
          color: #e5e7eb;
        }
        .comment-markdown pre code {
          padding: 0;
          background: transparent;
        }
      `}</style>
      {error ? <div style={{ color: 'var(--danger-text)', marginBottom: 16 }}>{error}</div> : null}
      {task ? (
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            {taskEditDecision.visible ? (
              editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => {
                    setEditingTitle(false)
                    if (titleDraft.trim() && titleDraft.trim() !== task.title) void saveTaskField({ title: titleDraft.trim() }, 'title')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                    if (event.key === 'Escape') {
                      setTitleDraft(task.title)
                      setEditingTitle(false)
                    }
                  }}
                  disabled={savingField === 'title'}
                  style={taskHeaderTitleInput}
                />
              ) : (
                <button type="button" onClick={() => setEditingTitle(true)} style={taskHeaderTitleButton}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.6em', marginRight: 8 }}>#{task.number}</span> : null}{task.title}</button>
              )
            ) : <div style={taskHeaderTitleText}>{task.number != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.6em', marginRight: 8 }}>#{task.number}</span> : null}{task.title}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
            <div style={panel}>
              <div style={sectionLabel}>Description</div>
              <div style={{ marginTop: 10, lineHeight: 1.6 }}>
                {taskEditDecision.visible ? (
                  <MarkdownDescriptionEditor
                    value={descriptionDraft}
                    onCommit={(nextValue) => { if (nextValue !== (task.description || '')) { setDescriptionDraft(nextValue); void saveTaskField({ description: nextValue }, 'description') } }}
                    onImageUpload={async (file) => {
                      const base64 = await fileToBase64(file)
                      return uploadTaskDescriptionImage(task.id, { base64, fileName: file.name, mimeType: file.type })
                    }}
                    busy={savingField === 'description'}
                  />
                ) : <TaskDescriptionRender description={task.description} />}
              </div>

              <div style={{ ...sectionLabel, marginTop: 24 }}>Tags</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {taskEditDecision.visible ? (
                  <input
                    value={labelsDraft}
                    onChange={(event) => setLabelsDraft(event.target.value)}
                    onBlur={() => {
                      const labels = Array.from(new Set(labelsDraft.split(',').map((label) => label.trim()).filter(Boolean)))
                      void updateTaskLabels(task.id, labels).then(refreshTask).catch((err) => setError(err instanceof Error ? err.message : 'Failed to update tags'))
                    }}
                    placeholder="comma, separated, tags"
                    style={projectInputField}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{task.labels?.length ? task.labels.map((label) => <span key={label} style={tagStyle()}>{label}</span>) : <span style={{ color: 'var(--text-muted)' }}>No tags.</span>}</div>
                )}
              </div>

              {cloudStorageEnabled ? (<>
              <div style={{ ...sectionLabel, marginTop: 24 }}>Connected resources</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                {task.connectedResources?.length ? task.connectedResources.map((resource) => (
                  <div key={resource.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{resource.name}</span>
                        <span style={tagStyle()}>{resourceProviderLabel(resource.provider)}</span>
                        <span style={tagStyle()}>{resource.kind.toLowerCase()}</span>
                      </div>
                      <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.webUrl}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <a href={resource.webUrl} target="_blank" rel="noreferrer" style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '8px 10px', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Open</a>
                      {taskEditDecision.visible ? <button type="button" onClick={() => void deleteTaskResource(task.id, resource.id).then(refreshTask).catch((err) => setError(err instanceof Error ? err.message : 'Failed to remove resource'))} style={{ ...taskMiniDelete, padding: '8px 0' }}>Remove</button> : null}
                    </div>
                  </div>
                )) : <div style={{ color: 'var(--text-muted)' }}>No connected resources yet.</div>}

                {taskEditDecision.visible ? (
                  <div style={{ border: '1px dashed var(--panel-border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <select value={resourceProvider} onChange={(event) => setResourceProvider(event.target.value as TaskConnectedResource['provider'])} disabled={!taskEditDecision.allowed || savingResource} style={projectInputField}>
                        <option value="GOOGLE_DRIVE">Google Drive</option>
                        <option value="MICROSOFT_365">Microsoft 365</option>
                        <option value="DROPBOX">Dropbox</option>
                      </select>
                      <select value={resourceKind} onChange={(event) => setResourceKind(event.target.value as TaskConnectedResource['kind'])} disabled={!taskEditDecision.allowed || savingResource} style={projectInputField}>
                        <option value="LINK">Link</option>
                        <option value="FILE">File</option>
                        <option value="FOLDER">Folder</option>
                      </select>
                    </div>
                    {resourceProvider === 'MICROSOFT_365' ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={microsoftSource} onChange={(event) => { setMicrosoftSource(event.target.value as 'onedrive' | 'sharepoint'); setSharePointSiteId(null); setSharePointDriveId(null); setSharePointItemId(null); setResourceResults([]) }} disabled={!taskEditDecision.allowed || savingResource} style={{ ...projectInputField, maxWidth: 220 }}>
                          <option value="onedrive">OneDrive</option>
                          <option value="sharepoint">SharePoint</option>
                        </select>
                        {microsoftSource === 'sharepoint' && (sharePointSiteId || sharePointDriveId) ? <button type="button" onClick={() => { setSharePointSiteId(null); setSharePointDriveId(null); setSharePointItemId(null); setResourceResults([]) }} style={{ ...taskMiniDelete, color: 'var(--text-muted)' }}>Back to sites</button> : null}
                        {microsoftSource === 'sharepoint' ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{sharePointDriveId ? 'Browsing document library' : sharePointSiteId ? 'Select a document library' : 'Search SharePoint sites'}</span> : null}
                      </div>
                    ) : null}
                    <input value={resourceName} onChange={(event) => setResourceName(event.target.value)} placeholder="Name, optional" disabled={!taskEditDecision.allowed || savingResource} style={projectInputField} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="Paste Google Drive, Microsoft 365, or Dropbox URL" disabled={!taskEditDecision.allowed || savingResource} style={{ ...projectInputField, flex: 1 }} />
                      <button type="button" onClick={() => void handleAddResource()} disabled={!taskEditDecision.allowed || savingResource || !resourceUrl.trim()} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>{savingResource ? 'Adding…' : 'Add'}</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleSearchResources() } }} placeholder={`Search ${resourceProviderLabel(resourceProvider)} files or folders`} disabled={!taskEditDecision.allowed || searchingResources} style={{ ...projectInputField, flex: 1 }} />
                      <button type="button" onClick={() => void handleSearchResources()} disabled={!taskEditDecision.allowed || searchingResources} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>{searchingResources ? 'Searching…' : 'Search'}</button>
                    </div>
                    {resourceResults.length ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {resourceResults.map((resource) => (
                          <button key={`${resource.provider}:${resource.externalId}`} type="button" onClick={() => void handleAttachProviderResource(resource)} disabled={savingResource} style={{ border: '1px solid var(--panel-border)', borderRadius: 10, padding: 10, background: 'var(--panel-bg)', color: 'var(--text-primary)', textAlign: 'left', cursor: savingResource ? 'progress' : 'pointer' }}>
                            <div style={{ fontWeight: 800 }}>{resource.name}</div>
                            <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: 12 }}>{resourceProviderLabel(resource.provider)} · {resourceResultLabel(resource)}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Paste a URL manually or search connected storage. Connect providers from Profile → Connected storage.</div>
                  </div>
                ) : null}
              </div>
              </>) : <div style={{ marginTop: 24 }}><EnterpriseLockedCard title="Connected resources" description="Google Drive, Microsoft 365, SharePoint, OneDrive, and Dropbox task resource connections are available in Sally Enterprise." /></div>}

              <div style={{ ...sectionLabel, marginTop: 24 }}>Checklist</div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {task.todos?.length ? task.todos.map((todo) => (
                  <div key={todo.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', flex: 1 }}>
                      <input type="checkbox" checked={todo.done} onChange={() => taskEditDecision.allowed ? void updateTaskTodo(task.id, todo.id, { done: !todo.done, text: todo.text }).then(refreshTask) : undefined} disabled={!taskEditDecision.allowed} />
                      <span style={{ textDecoration: todo.done ? 'line-through' : 'none', opacity: todo.done ? 0.6 : 1 }}>{todo.text}</span>
                    </label>
                    {taskEditDecision.visible ? <button type="button" onClick={() => void deleteTaskTodo(task.id, todo.id).then(refreshTask)} style={taskMiniDelete}>Delete</button> : null}
                  </div>
                )) : <div style={{ color: 'var(--text-muted)' }}>No checklist items.</div>}
                {taskEditDecision.visible ? <input value={newTodo} onChange={(event) => setNewTodo(event.target.value)} onKeyDown={(event) => {
                  if (event.key === 'Enter' && newTodo.trim()) {
                    event.preventDefault()
                    void createTaskTodo(task.id, { text: newTodo.trim() }).then(async () => { setNewTodo(''); await refreshTask() })
                  }
                }} placeholder="Add checklist item and press Enter" style={projectInputField} /> : null}
              </div>

              <button
                type="button"
                onClick={() => setCommentsOpen((current) => !current)}
                style={{ ...sectionLabel, marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
              >
                <span>Comments{task.comments.length ? ` (${task.comments.length})` : ''}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>{commentsOpen ? 'Hide' : 'Show'}</span>
              </button>
              {commentsOpen ? <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
                {task.comments.length ? task.comments.map((comment) => (
                  <div key={comment.id} style={{ border: '1px solid var(--panel-border)', borderRadius: 12, padding: 12, background: 'var(--form-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AssigneeAvatar name={comment.author} avatarUrl={comment.authorAvatarUrl} size={32} />
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{comment.author}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(comment.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="comment-markdown" style={{ marginTop: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(comment.body) }} />
                  </div>
                )) : <div style={{ color: 'var(--text-muted)' }}>No comments yet.</div>}

                {taskEditDecision.visible ? (
                  <div style={{ position: 'relative', display: 'grid', gap: 8 }}>
                    <MarkdownDescriptionEditor
                      value={commentBody}
                      onChange={setCommentBody}
                      onCommit={setCommentBody}
                      onImageUpload={async (file) => {
                        const base64 = await fileToBase64(file)
                        return uploadTaskDescriptionImage(task.id, { base64, fileName: file.name, mimeType: file.type })
                      }}
                      busy={!taskEditDecision.allowed || submittingComment}
                      compact
                    />
                    {mentionOptions.length ? (
                      <div style={{ position: 'absolute', top: 'calc(100% - 8px)', left: 0, width: 'min(360px, 100%)', zIndex: 10, border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
                        {mentionOptions.map((user) => (
                          <button key={user.accountId} type="button" onClick={() => insertMention(user)} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--panel-border)', background: 'transparent', cursor: 'pointer' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{user.name || user.email}</div>
                            <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Use the rich Markdown editor. Type <strong>/</strong> for formatting and images.</div>
                      <button type="button" onClick={() => void handleSubmitComment()} disabled={!taskEditDecision.allowed || submittingComment || !commentBody.trim()} style={{ background: 'var(--form-bg)', color: 'var(--form-text)', border: '1px solid var(--form-border)', borderRadius: 10, padding: '10px 12px', fontWeight: 700 }}>
                        {submittingComment ? 'Posting…' : 'Post comment'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div> : null}
            </div>

            <div style={panel}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><div style={sectionLabel}>Project</div><div style={{ marginTop: 4 }}><Link href={`/projects/${task.project.id}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 700 }}>{task.project.name}</Link></div></div>
                <div><div style={sectionLabel}>People</div><div style={{ marginTop: 6 }}><TaskPeopleAvatarStack owner={task.owner} ownerAvatarUrl={task.ownerAvatarUrl} participants={task.participants} assignee={task.assignee} assigneeAvatarUrl={task.assigneeAvatarUrl} collaborators={task.collaborators} size={36} /></div></div>
                <div><div style={sectionLabel}>Priority</div><div style={{ marginTop: 4, fontSize: 18, color: 'var(--text-primary)' }}>{priorityStars(task.priority)}</div></div>
                <div><div style={sectionLabel}>Status</div><div style={{ marginTop: 4 }}><span style={tagStyle()}>{task.status}</span></div></div>
                <div><div style={sectionLabel}>Created</div><div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(task.createdAt).toLocaleDateString()}</div></div>
                <div><div style={sectionLabel}>Last updated</div><div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(task.updatedAt).toLocaleDateString()}</div></div>
                {task.dependencies?.length ? (
                  <div>
                    <div style={sectionLabel}>Depends on</div>
                    <div style={{ marginTop: 4, display: 'grid', gap: 4 }}>
                      {task.dependencies.map((dep) => (
                        <Link key={dep.taskId} href={`/tasks/${dep.taskId}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontSize: 13 }}>
                          {dep.number != null ? <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>#{dep.number}</span> : null}{dep.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {task.dependedOnBy?.length ? (
                  <div>
                    <div style={sectionLabel}>Blocks</div>
                    <div style={{ marginTop: 4, display: 'grid', gap: 4 }}>
                      {task.dependedOnBy.map((dep) => (
                        <Link key={dep.taskId} href={`/tasks/${dep.taskId}`} style={{ textDecoration: 'none', color: 'var(--text-primary)', fontSize: 13 }}>
                          {dep.number != null ? <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>#{dep.number}</span> : null}{dep.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : <div style={{ color: 'var(--text-muted)' }}>Loading task…</div>}
    </AppShell>
  )
}

function resourceProviderLabel(provider: TaskConnectedResource['provider']) {
  if (provider === 'GOOGLE_DRIVE') return 'Google Drive'
  if (provider === 'MICROSOFT_365') return 'Microsoft 365'
  if (provider === 'DROPBOX') return 'Dropbox'
  return provider
}

function providerSlug(provider: TaskConnectedResource['provider']) {
  if (provider === 'GOOGLE_DRIVE') return 'google-drive'
  if (provider === 'MICROSOFT_365') return 'microsoft-365'
  return 'dropbox'
}

function resourceResultLabel(resource: ProviderResource) {
  const resourceType = typeof resource.metadata?.resourceType === 'string' ? resource.metadata.resourceType : ''
  if (resourceType === 'SITE') return 'SharePoint site — open to browse libraries'
  if (resourceType === 'DRIVE') return 'Document library — open to browse files'
  return resource.kind.toLowerCase()
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.split(',').pop() || '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const sectionLabel: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }
const taskHeaderTitleText: React.CSSProperties = { fontSize: 30, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.1, overflowWrap: 'anywhere', wordBreak: 'break-word' }
const taskHeaderTitleButton: React.CSSProperties = { ...taskHeaderTitleText, display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'text' }
const taskHeaderTitleInput: React.CSSProperties = { ...projectInputField, fontSize: 30, fontWeight: 750, lineHeight: 1.1, padding: '8px 10px' }
const taskMiniDelete: React.CSSProperties = { padding: 0, border: 'none', background: 'transparent', color: 'var(--danger-text)', fontSize: 12, cursor: 'pointer' }
