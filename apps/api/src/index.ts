import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient, TaskStatusType, TaskPriority } from '@prisma/client'
import fs from 'node:fs'
import path from 'node:path'
import { hasExactTodoOrder, normalizeTaskLabels, normalizeTaskTodoTexts } from './task-helpers.js'
import { cleanupRemovedDescriptionImages, saveTaskImage, serveTaskImage } from './task-description-images.js'

function loadSimpleEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const envText = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}
loadSimpleEnv(path.resolve(process.cwd(), '.env'))
loadSimpleEnv(path.resolve(process.cwd(), '../../packages/db/.env'))

const prisma = new PrismaClient()
const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 })

function slugify(input: string) { return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
function toIsoOrNull(input?: string | null) { if (!input) return null; const v = input.trim(); if (!v) return null; return new Date(v).toISOString() }

function summarizeTimesheets(entries: { minutes: number; billable: boolean }[]) {
  return {
    totalMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
    billableMinutes: entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entry.minutes, 0),
    entries: entries.length,
  }
}

function formatTimesheetEntry(entry: { id: string; userId: string; date: Date; minutes: number; description: string | null; billable: boolean; validated: boolean; createdAt: Date; user: { name: string }; taskId?: string | null; task?: { title: string | null } }) {
  return {
    id: entry.id,
    userId: entry.userId,
    userName: entry.user.name,
    projectId: 'projectId' in entry ? (entry as any).projectId : undefined,
    taskId: entry.taskId ?? null,
    taskTitle: entry.task?.title ?? null,
    date: entry.date.toISOString(),
    minutes: entry.minutes,
    description: entry.description,
    billable: entry.billable,
    validated: entry.validated,
    createdAt: entry.createdAt.toISOString(),
  }
}

async function getBoardData(projectId?: string) {
  const statuses = await prisma.taskStatus.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: [{ position: 'asc' }],
    include: { tasks: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { labels: { include: { label: true } }, todos: true } } },
  })

  return statuses.map((status) => ({
    id: status.id,
    title: status.name,
    type: status.type,
    cards: status.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      meta: `${task.assignee ?? 'Unassigned'} · ${task.priority}`,
      description: task.description ?? 'No description yet.',
      assignee: task.assignee ?? 'Unassigned',
      priority: task.priority,
      status: status.name,
      statusId: status.id,
      dueDate: task.dueDate?.toISOString() ?? null,
      labels: task.labels.map((l) => l.label.name),
      todoProgress: task.todos.length ? `${task.todos.filter((t) => t.done).length}/${task.todos.length}` : null,
    })),
  }))
}

const start = async () => {
  try {
    await app.register(cors, { origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type'] })

    app.get('/health', async () => ({ ok: true, service: 'api', timestamp: new Date().toISOString() }))
    app.get('/uploads/task-images/*', async (request, reply) => {
      const wildcard = (request.params as { '*': string })['*'] || ''
      const file = serveTaskImage(wildcard.split('/').filter(Boolean))
      if (!file) return reply.code(404).send({ ok: false, error: 'Image not found' })
      reply.header('Content-Type', file.mimeType)
      return reply.send(fs.createReadStream(file.absolutePath))
    })
    app.get('/projects/summary', async () => {
      const [activeProjects, openTasks, inReview] = await Promise.all([
        prisma.project.count(),
        prisma.task.count({ where: { status: { type: { in: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW'] } } } }),
        prisma.task.count({ where: { status: { type: 'REVIEW' } } }),
      ])
      return { activeProjects, openTasks, cycleHealth: inReview > 3 ? 'Needs review' : 'Good' }
    })

    app.get('/projects', async () => {
      const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' }, include: { client: true, tasks: { include: { status: true } } } })
      return projects.map((project) => {
        const reviewCount = project.tasks.filter((task) => task.status.type === 'REVIEW').length
        return { id: project.id, name: project.name, client: project.client ? { id: project.client.id, name: project.client.name } : null, lead: project.tasks[0]?.assignee ?? 'Unassigned', tasks: project.tasks.length, status: reviewCount > 0 ? 'Review' : 'Active' }
      })
    })

    app.get('/clients', async () => {
      const clients = await prisma.client.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { projects: true } } } })
      return clients.map((client) => ({ id: client.id, name: client.name, notes: client.notes, projectCount: client._count.projects }))
    })

    app.post('/clients', async (request, reply) => {
      const body = request.body as { name: string; notes?: string }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'No workspace found' })
      const existing = await prisma.client.findFirst({ where: { workspaceId: workspace.id, name } })
      if (existing) return { ok: true, clientId: existing.id, existing: true }
      const client = await prisma.client.create({ data: { workspaceId: workspace.id, name, notes: body.notes?.trim() || null } })
      return { ok: true, clientId: client.id }
    })

    app.get('/projects/:projectId', async (request, reply) => {
      const { projectId } = request.params as { projectId: string }
      const project = await prisma.project.findUnique({ where: { id: projectId }, include: { client: true, tasks: { include: { status: true, labels: { include: { label: true } }, todos: true }, orderBy: [{ createdAt: 'asc' }] }, statuses: { orderBy: [{ position: 'asc' }] }, labels: { orderBy: [{ name: 'asc' }] }, timesheets: { include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 12 } } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const openTasks = project.tasks.filter((t) => t.status.type !== 'DONE').length
      const reviewTasks = project.tasks.filter((t) => t.status.type === 'REVIEW').length
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        client: project.client ? { id: project.client.id, name: project.client.name } : null,
        taskCount: project.tasks.length,
        openTasks,
        reviewTasks,
        statuses: project.statuses.map((s) => ({ id: s.id, name: s.name, type: s.type, position: s.position })),
        labels: project.labels.map((l) => ({ id: l.id, name: l.name })),
        timesheetSummary: summarizeTimesheets(project.timesheets),
        timesheetUsers: Array.from(new Map(project.timesheets.map((entry) => [entry.userId, { id: entry.userId, name: entry.user.name }])).values()),
        recentTimesheets: project.timesheets.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: project.id, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, createdAt: entry.createdAt.toISOString() })),
        recentTasks: project.tasks.slice(0, 8).map((t) => ({ id: t.id, title: t.title, assignee: t.assignee ?? 'Unassigned', priority: t.priority, status: t.status.name, statusId: t.statusId, dueDate: t.dueDate?.toISOString() ?? null, labels: t.labels.map((l) => l.label.name), todoProgress: t.todos.length ? `${t.todos.filter((td) => td.done).length}/${t.todos.length}` : null })),
      }
    })

    app.get('/projects/:projectId/tasks', async (request, reply) => {
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { status?: string; assignee?: string; search?: string; label?: string }
      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const tasks = await prisma.task.findMany({ where: { projectId, ...(query.assignee ? { assignee: { contains: query.assignee, mode: 'insensitive' } } : {}), ...(query.search ? { OR: [{ title: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }] } : {}), ...(query.status ? { status: { name: query.status } } : {}), ...(query.label ? { labels: { some: { label: { name: query.label } } } } : {}) }, include: { status: true, labels: { include: { label: true } }, todos: true }, orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }] })
      return tasks.map((t) => ({ id: t.id, title: t.title, assignee: t.assignee ?? 'Unassigned', priority: t.priority, status: t.status.name, statusId: t.statusId, dueDate: t.dueDate?.toISOString() ?? null, labels: t.labels.map((l) => l.label.name), todoProgress: t.todos.length ? `${t.todos.filter((td) => td.done).length}/${t.todos.length}` : null }))
    })

    app.get('/tasks/:taskId', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const task = await prisma.task.findUnique({ where: { id: taskId }, include: { project: { include: { client: true } }, status: true, comments: { orderBy: { createdAt: 'asc' } }, labels: { include: { label: true } }, todos: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }, timesheets: { include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 20 } } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      return { id: task.id, title: task.title, description: task.description ?? 'No description yet.', assignee: task.assignee ?? 'Unassigned', priority: task.priority, status: task.status.name, statusId: task.statusId, dueDate: task.dueDate?.toISOString() ?? null, labels: task.labels.map((l) => l.label.name), todos: task.todos.map((t) => ({ id: t.id, text: t.text, done: t.done, position: t.position })), timesheetSummary: summarizeTimesheets(task.timesheets), timesheetUsers: Array.from(new Map(task.timesheets.map((entry) => [entry.userId, { id: entry.userId, name: entry.user.name }])).values()), timesheets: task.timesheets.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: task.project.id, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, createdAt: entry.createdAt.toISOString() })), project: { id: task.project.id, name: task.project.name, client: task.project.client ? { id: task.project.client.id, name: task.project.client.name } : null }, comments: task.comments.map((c) => ({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt })) }
    })

    app.post('/tasks/:taskId/todos', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { text: string }
      const text = body.text?.trim()
      if (!text) return reply.code(400).send({ ok: false, error: 'text is required' })
      const task = await prisma.task.findUnique({ where: { id: taskId } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      const maxPos = await prisma.taskTodo.aggregate({ where: { taskId }, _max: { position: true } })
      const todo = await prisma.taskTodo.create({ data: { taskId, text, position: (maxPos._max.position ?? -1) + 1 } })
      return { ok: true, todoId: todo.id }
    })

    app.patch('/tasks/:taskId/todos/:todoId', async (request, reply) => {
      const { taskId, todoId } = request.params as { taskId: string; todoId: string }
      const body = request.body as { text?: string; done?: boolean }
      const todo = await prisma.taskTodo.findFirst({ where: { id: todoId, taskId } })
      if (!todo) return reply.code(404).send({ ok: false, error: 'Todo not found' })
      await prisma.taskTodo.update({ where: { id: todoId }, data: { ...(body.text !== undefined ? { text: body.text.trim() } : {}), ...(body.done !== undefined ? { done: body.done } : {}) } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/todos/:todoId/delete', async (request, reply) => {
      const { taskId, todoId } = request.params as { taskId: string; todoId: string }
      const todo = await prisma.taskTodo.findFirst({ where: { id: todoId, taskId } })
      if (!todo) return reply.code(404).send({ ok: false, error: 'Todo not found' })
      await prisma.taskTodo.delete({ where: { id: todoId } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/todos/reorder', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { orderedTodoIds: string[] }
      if (!Array.isArray(body.orderedTodoIds) || !body.orderedTodoIds.length) return reply.code(400).send({ ok: false, error: 'orderedTodoIds is required' })
      const todos = await prisma.taskTodo.findMany({ where: { taskId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
      if (!todos.length) return reply.code(404).send({ ok: false, error: 'No todos found' })
      if (!hasExactTodoOrder(todos.map((todo) => todo.id), body.orderedTodoIds)) {
        return reply.code(400).send({ ok: false, error: 'orderedTodoIds must exactly match task todos' })
      }
      await prisma.$transaction(body.orderedTodoIds.map((id, index) => prisma.taskTodo.update({ where: { id }, data: { position: index } })))
      return { ok: true }
    })

    app.post('/projects/:projectId/labels', async (request, reply) => {
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { name: string }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const label = await prisma.label.upsert({ where: { projectId_name: { projectId, name } }, update: {}, create: { projectId, name } })
      return { ok: true, labelId: label.id }
    })

    app.patch('/tasks/:taskId/labels', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { labels: string[] }
      const task = await prisma.task.findUnique({ where: { id: taskId } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      const labels = Array.from(new Set((body.labels || []).map((s) => s.trim()).filter(Boolean)))
      await prisma.$transaction(async (tx) => {
        const ids: string[] = []
        for (const name of labels) {
          const label = await tx.label.upsert({ where: { projectId_name: { projectId: task.projectId, name } }, update: {}, create: { projectId: task.projectId, name } })
          ids.push(label.id)
        }
        await tx.taskLabel.deleteMany({ where: { taskId } })
        if (ids.length) await tx.taskLabel.createMany({ data: ids.map((labelId) => ({ taskId, labelId })) })
      })
      return { ok: true }
    })

    app.post('/projects/:projectId/statuses', async (request, reply) => {
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { name: string }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      const maxPos = await prisma.taskStatus.aggregate({ where: { projectId }, _max: { position: true } })
      const status = await prisma.taskStatus.create({ data: { projectId, name, type: 'TODO', position: (maxPos._max.position ?? -1) + 1, color: '#cbd5e1' } })
      return { ok: true, statusId: status.id }
    })

    app.patch('/projects/:projectId/statuses/:statusId', async (request, reply) => {
      const { projectId, statusId } = request.params as { projectId: string; statusId: string }
      const body = request.body as { name?: string }
      const status = await prisma.taskStatus.findFirst({ where: { id: statusId, projectId } })
      if (!status) return reply.code(404).send({ ok: false, error: 'Status not found' })
      await prisma.taskStatus.update({ where: { id: statusId }, data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}) } })
      return { ok: true }
    })

    app.post('/projects/:projectId/statuses/:statusId/delete', async (request, reply) => {
      const { projectId, statusId } = request.params as { projectId: string; statusId: string }
      const body = request.body as { targetStatusId?: string }
      const statuses = await prisma.taskStatus.findMany({ where: { projectId }, orderBy: { position: 'asc' } })
      const status = statuses.find((s) => s.id === statusId)
      if (!status) return reply.code(404).send({ ok: false, error: 'Status not found' })
      if (statuses.length <= 1) return reply.code(400).send({ ok: false, error: 'Cannot delete the last status' })
      const taskCount = await prisma.task.count({ where: { statusId } })
      const fallbackTarget = statuses.find((s) => s.id !== statusId)
      const targetStatusId = body.targetStatusId || fallbackTarget?.id
      if (taskCount > 0 && !targetStatusId) return reply.code(400).send({ ok: false, error: 'Target status required' })
      if (targetStatusId === statusId) return reply.code(400).send({ ok: false, error: 'Target status must differ' })
      await prisma.$transaction(async (tx) => {
        if (taskCount > 0 && targetStatusId) await tx.task.updateMany({ where: { statusId }, data: { statusId: targetStatusId } })
        await tx.taskStatus.delete({ where: { id: statusId } })
      })
      return { ok: true }
    })

    app.patch('/projects/:projectId', async (request, reply) => {
      const { projectId } = request.params as { projectId: string }
      const body = request.body as { name?: string; description?: string; clientId?: string | null }
      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      let nextSlug = project.slug
      if (body.name && body.name.trim() && body.name.trim() != project.name) {
        let base = slugify(body.name), slug = base, suffix = 1
        while (await prisma.project.findFirst({ where: { workspaceId: project.workspaceId, slug, id: { not: projectId } } })) { suffix += 1; slug = `${base}-${suffix}` }
        nextSlug = slug
      }
      let nextClientId: string | null | undefined = undefined
      if (body.clientId !== undefined) {
        if (!body.clientId) {
          nextClientId = null
        } else {
          const client = await prisma.client.findFirst({ where: { id: body.clientId, workspaceId: project.workspaceId } })
          if (!client) return reply.code(404).send({ ok: false, error: 'Client not found' })
          nextClientId = client.id
        }
      }
      await prisma.project.update({ where: { id: projectId }, data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.description !== undefined ? { description: body.description.trim() || null } : {}), ...(body.clientId !== undefined ? { clientId: nextClientId ?? null } : {}), slug: nextSlug } })
      return { ok: true }
    })

    app.post('/projects', async (request, reply) => {
      const body = request.body as { name: string; description?: string; clientId?: string | null }
      const name = body.name?.trim()
      if (!name) return reply.code(400).send({ ok: false, error: 'name is required' })
      const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } })
      if (!workspace) return reply.code(404).send({ ok: false, error: 'No workspace found' })
      let slug = slugify(name), suffix = 1
      while (await prisma.project.findFirst({ where: { workspaceId: workspace.id, slug } })) { suffix += 1; slug = `${slugify(name)}-${suffix}` }
      let clientId: string | null = null
      if (body.clientId) {
        const client = await prisma.client.findFirst({ where: { id: body.clientId, workspaceId: workspace.id } })
        if (!client) return reply.code(404).send({ ok: false, error: 'Client not found' })
        clientId = client.id
      }
      const project = await prisma.project.create({ data: { workspaceId: workspace.id, clientId, name, slug, description: body.description?.trim() || null, statuses: { create: [
        { name: 'Backlog', type: 'BACKLOG', position: 0, color: '#94a3b8' },
        { name: 'In Progress', type: 'IN_PROGRESS', position: 1, color: '#60a5fa' },
        { name: 'Review', type: 'REVIEW', position: 2, color: '#fbbf24' },
        { name: 'Done', type: 'DONE', position: 3, color: '#34d399' },
      ] } } })
      return { ok: true, projectId: project.id }
    })

    app.get('/board', async (request) => {
      const query = request.query as { projectId?: string }
      return getBoardData(query.projectId)
    })

    app.post('/tasks', async (request, reply) => {
      const body = request.body as { projectId: string; title: string; assignee?: string; description?: string; priority?: TaskPriority; status?: string; statusId?: string; dueDate?: string | null; labels?: string[]; todos?: { text: string }[] }
      if (!body.projectId || !body.title?.trim()) return reply.code(400).send({ ok: false, error: 'projectId and title are required' })
      let targetStatus = null
      if (body.statusId) targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.statusId, projectId: body.projectId } })
      if (!targetStatus && body.status) targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: body.projectId, name: body.status } })
      if (!targetStatus) targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: body.projectId }, orderBy: { position: 'asc' } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found for project' })
      const count = await prisma.task.count({ where: { statusId: targetStatus.id } })
      const labels = normalizeTaskLabels(body.labels)
      const todos = normalizeTaskTodoTexts(body.todos)
      const task = await prisma.$transaction(async (tx) => {
        const createdTask = await tx.task.create({ data: { projectId: body.projectId, statusId: targetStatus.id, title: body.title.trim(), description: body.description?.trim() || null, assignee: body.assignee?.trim() || null, priority: body.priority ?? 'P2', dueDate: toIsoOrNull(body.dueDate), position: count } })
        if (labels.length) {
          const labelIds: string[] = []
          for (const name of labels) {
            const label = await tx.label.upsert({ where: { projectId_name: { projectId: body.projectId, name } }, update: {}, create: { projectId: body.projectId, name } })
            labelIds.push(label.id)
          }
          await tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId: createdTask.id, labelId })) })
        }
        if (todos.length) {
          await tx.taskTodo.createMany({ data: todos.map((text, index) => ({ taskId: createdTask.id, text, position: index })) })
        }
        return createdTask
      })
      return { ok: true, taskId: task.id }
    })

    app.patch('/tasks/:taskId', async (request, reply) => {
      const params = request.params as { taskId: string }
      const body = request.body as { title?: string; description?: string; assignee?: string; priority?: TaskPriority; dueDate?: string | null; statusId?: string }
      const existing = await prisma.task.findUnique({ where: { id: params.taskId } })
      if (!existing) return reply.code(404).send({ ok: false, error: 'Task not found' })
      const nextDescription = body.description !== undefined ? body.description : existing.description
      await prisma.task.update({ where: { id: params.taskId }, data: { ...(body.title !== undefined ? { title: body.title } : {}), ...(body.description !== undefined ? { description: body.description } : {}), ...(body.assignee !== undefined ? { assignee: body.assignee } : {}), ...(body.priority !== undefined ? { priority: body.priority } : {}), ...(body.dueDate !== undefined ? { dueDate: toIsoOrNull(body.dueDate) } : {}), ...(body.statusId !== undefined ? { statusId: body.statusId } : {}) } })
      if (body.description !== undefined) cleanupRemovedDescriptionImages(existing.description, nextDescription)
      return { ok: true }
    })

    app.delete('/tasks/:taskId', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const task = await prisma.task.findUnique({ where: { id: taskId } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      await prisma.task.delete({ where: { id: taskId } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/image-upload', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { fileName?: string; mimeType?: string; base64?: string }
      const task = await prisma.task.findUnique({ where: { id: taskId } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      if (!body.base64) return reply.code(400).send({ ok: false, error: 'base64 is required' })
      const saved = saveTaskImage(taskId, { fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 })
      return { ok: true, url: saved.url }
    })

    app.get('/projects/:projectId/timesheets', async (request, reply) => {
      const { projectId } = request.params as { projectId: string }
      const query = request.query as { from?: string; to?: string }
      const where: any = { projectId }
      if (query.from || query.to) {
        where.date = {}
        if (query.from) where.date.gte = new Date(`${query.from}T00:00:00.000Z`)
        if (query.to) where.date.lte = new Date(`${query.to}T23:59:59.999Z`)
      }
      const entries = await prisma.timesheetEntry.findMany({ where, include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] })
      return { summary: summarizeTimesheets(entries), entries: entries.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: entry.projectId, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })) }
    })

    app.get('/tasks/:taskId/timesheets', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const entries = await prisma.timesheetEntry.findMany({ where: { taskId }, include: { user: true, task: { select: { title: true } } }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] })
      return { summary: summarizeTimesheets(entries), entries: entries.map((entry) => ({ id: entry.id, userId: entry.userId, userName: entry.user.name, projectId: entry.projectId, taskId: entry.taskId ?? null, taskTitle: entry.task?.title ?? null, date: entry.date.toISOString(), minutes: entry.minutes, description: entry.description, billable: entry.billable, validated: entry.validated, createdAt: entry.createdAt.toISOString() })) }
    })

    app.get('/timesheets/report', async (request) => {
      const query = request.query as { from?: string; to?: string; projectId?: string; clientId?: string; taskId?: string; showValidated?: string }
      const where: any = {}
      if (query.projectId) where.projectId = query.projectId
      if (query.taskId) where.taskId = query.taskId
      if (query.clientId) where.project = { clientId: query.clientId }
      if (query.showValidated !== 'true') where.validated = false
      if (query.from || query.to) {
        where.date = {}
        if (query.from) where.date.gte = new Date(`${query.from}T00:00:00.000Z`)
        if (query.to) where.date.lte = new Date(`${query.to}T23:59:59.999Z`)
      }
      const entries = await prisma.timesheetEntry.findMany({
        where,
        include: {
          user: true,
          task: { select: { title: true } },
          project: { include: { client: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      })
      return {
        summary: summarizeTimesheets(entries),
        entries: entries.map((entry) => ({
          id: entry.id,
          userId: entry.userId,
          userName: entry.user.name,
          projectId: entry.projectId,
          projectName: entry.project.name,
          clientId: entry.project.client?.id ?? null,
          clientName: entry.project.client?.name ?? null,
          taskId: entry.taskId ?? null,
          taskTitle: entry.task?.title ?? null,
          date: entry.date.toISOString(),
          minutes: entry.minutes,
          description: entry.description,
          billable: entry.billable,
          validated: entry.validated,
          createdAt: entry.createdAt.toISOString(),
        })),
      }
    })

    app.post('/timesheets', async (request, reply) => {
      const body = request.body as { userName?: string; userId?: string; projectId: string; taskId?: string | null; date?: string; minutes: number; description?: string; billable?: boolean; validated?: boolean }
      if (!body.projectId || !body.minutes || body.minutes <= 0) return reply.code(400).send({ ok: false, error: 'projectId and positive minutes are required' })
      const project = await prisma.project.findUnique({ where: { id: body.projectId } })
      if (!project) return reply.code(404).send({ ok: false, error: 'Project not found' })
      if (body.taskId) {
        const task = await prisma.task.findFirst({ where: { id: body.taskId, projectId: body.projectId } })
        if (!task) return reply.code(404).send({ ok: false, error: 'Task not found for project' })
      }
      let userId = body.userId
      if (!userId) {
        const userName = body.userName?.trim() || 'Alex'
        const user = await prisma.user.upsert({ where: { workspaceId_name: { workspaceId: project.workspaceId, name: userName } }, update: {}, create: { workspaceId: project.workspaceId, name: userName } })
        userId = user.id
      }
      const entry = await prisma.timesheetEntry.create({ data: { userId, projectId: body.projectId, taskId: body.taskId || null, date: new Date(body.date || new Date().toISOString()), minutes: Math.round(body.minutes), description: body.description?.trim() || null, billable: body.billable ?? true, validated: body.validated ?? false } })
      return { ok: true, timesheetId: entry.id }
    })

    app.patch('/timesheets/:timesheetId', async (request, reply) => {
      const { timesheetId } = request.params as { timesheetId: string }
      const body = request.body as { minutes?: number; description?: string | null; date?: string; billable?: boolean; validated?: boolean; taskId?: string | null }
      const entry = await prisma.timesheetEntry.findUnique({ where: { id: timesheetId }, select: { id: true, projectId: true } })
      if (!entry) return reply.code(404).send({ ok: false, error: 'Timesheet entry not found' })
      const data: Record<string, any> = {}
      if (body.minutes !== undefined) {
        const minutes = Math.round(Number(body.minutes))
        if (!minutes || minutes <= 0) return reply.code(400).send({ ok: false, error: 'minutes must be > 0' })
        data.minutes = minutes
      }
      if (body.description !== undefined) data.description = body.description?.trim() || null
      if (body.date !== undefined) {
        const dateValue = new Date(body.date)
        if (Number.isNaN(dateValue.getTime())) return reply.code(400).send({ ok: false, error: 'date is invalid' })
        data.date = dateValue
      }
      if (body.billable !== undefined) data.billable = body.billable
      if (body.validated !== undefined) data.validated = body.validated
      if (body.taskId !== undefined) {
        if (!body.taskId) {
          data.taskId = null
        } else {
          const task = await prisma.task.findFirst({ where: { id: body.taskId, projectId: entry.projectId } })
          if (!task) return reply.code(404).send({ ok: false, error: 'Task not found for entry project' })
          data.taskId = task.id
        }
      }
      if (!Object.keys(data).length) return reply.code(400).send({ ok: false, error: 'No editable fields provided' })
      await prisma.timesheetEntry.update({ where: { id: timesheetId }, data })
      return { ok: true }
    })

    app.delete('/timesheets/:timesheetId', async (request, reply) => {
      const { timesheetId } = request.params as { timesheetId: string }
      const entry = await prisma.timesheetEntry.findUnique({ where: { id: timesheetId } })
      if (!entry) return reply.code(404).send({ ok: false, error: 'Timesheet entry not found' })
      await prisma.timesheetEntry.delete({ where: { id: timesheetId } })
      return { ok: true }
    })

    app.post('/tasks/:taskId/comments', async (request, reply) => {
      const { taskId } = request.params as { taskId: string }
      const body = request.body as { body: string; author?: string }
      const commentBody = body.body?.trim()
      if (!commentBody) return reply.code(400).send({ ok: false, error: 'comment body is required' })
      const task = await prisma.task.findUnique({ where: { id: taskId } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      const comment = await prisma.comment.create({ data: { taskId, body: commentBody, author: body.author?.trim() || 'Alex' } })
      return { ok: true, commentId: comment.id }
    })

    app.post('/tasks/reorder', async (request, reply) => {
      const body = request.body as { taskId: string; targetStatusId: string; orderedTaskIds: string[] }
      if (!body.taskId || !body.targetStatusId || !Array.isArray(body.orderedTaskIds)) return reply.code(400).send({ ok: false, error: 'Invalid reorder payload' })
      const task = await prisma.task.findUnique({ where: { id: body.taskId } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      const targetStatus = await prisma.taskStatus.findFirst({ where: { id: body.targetStatusId, projectId: task.projectId } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found' })
      await prisma.$transaction(async (tx) => {
        await tx.task.update({ where: { id: body.taskId }, data: { statusId: targetStatus.id } })
        for (const [index, id] of body.orderedTaskIds.entries()) await tx.task.update({ where: { id }, data: { statusId: targetStatus.id, position: index } })
      })
      return { ok: true }
    })

    app.post('/tasks/:taskId/move', async (request, reply) => {
      const params = request.params as { taskId: string }
      const body = request.body as { targetStatus: string }
      const task = await prisma.task.findUnique({ where: { id: params.taskId } })
      if (!task) return reply.code(404).send({ ok: false, error: 'Task not found' })
      const targetStatus = await prisma.taskStatus.findFirst({ where: { projectId: task.projectId, name: body.targetStatus } })
      if (!targetStatus) return reply.code(404).send({ ok: false, error: 'Target status not found' })
      await prisma.task.update({ where: { id: params.taskId }, data: { statusId: targetStatus.id } })
      return { ok: true }
    })

    await app.listen({ port: 4000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
