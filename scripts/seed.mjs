import { PrismaClient, TaskPriority, TaskStatusType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.workspace.findFirst({ where: { slug: 'automatethis' } })
  if (existing) return

  const workspace = await prisma.workspace.create({
    data: {
      name: 'AutomateThis',
      slug: 'automatethis',
      projects: {
        create: [
          {
            name: 'AutomateThis Core',
            slug: 'automate-this-core',
            description: 'Core product and ops workflows',
            statuses: { create: [
              { name: 'Backlog', type: TaskStatusType.BACKLOG, position: 0, color: '#94a3b8' },
              { name: 'In Progress', type: TaskStatusType.IN_PROGRESS, position: 1, color: '#60a5fa' },
              { name: 'Review', type: TaskStatusType.REVIEW, position: 2, color: '#fbbf24' },
              { name: 'Done', type: TaskStatusType.DONE, position: 3, color: '#34d399' },
            ] },
          },
          {
            name: 'Website Relaunch',
            slug: 'website-relaunch',
            description: 'Site refresh and messaging',
            statuses: { create: [
              { name: 'Backlog', type: TaskStatusType.BACKLOG, position: 0, color: '#94a3b8' },
              { name: 'In Progress', type: TaskStatusType.IN_PROGRESS, position: 1, color: '#60a5fa' },
              { name: 'Review', type: TaskStatusType.REVIEW, position: 2, color: '#fbbf24' },
              { name: 'Done', type: TaskStatusType.DONE, position: 3, color: '#34d399' },
            ] },
          },
          {
            name: 'Internal Ops',
            slug: 'internal-ops',
            description: 'Internal process and systems',
            statuses: { create: [
              { name: 'Backlog', type: TaskStatusType.BACKLOG, position: 0, color: '#94a3b8' },
              { name: 'In Progress', type: TaskStatusType.IN_PROGRESS, position: 1, color: '#60a5fa' },
              { name: 'Review', type: TaskStatusType.REVIEW, position: 2, color: '#fbbf24' },
              { name: 'Done', type: TaskStatusType.DONE, position: 3, color: '#34d399' },
            ] },
          },
        ],
      },
    },
    include: { projects: { include: { statuses: true } } },
  })

  for (const project of workspace.projects) {
    const backlog = project.statuses.find((s) => s.type === TaskStatusType.BACKLOG)
    const inProgress = project.statuses.find((s) => s.type === TaskStatusType.IN_PROGRESS)
    const review = project.statuses.find((s) => s.type === TaskStatusType.REVIEW)
    if (!backlog || !inProgress || !review) continue

    await prisma.task.createMany({
      data: [
        { projectId: project.id, statusId: backlog.id, title: `Define scope for ${project.name}`, priority: TaskPriority.P1, assignee: 'Alex', position: 0 },
        { projectId: project.id, statusId: inProgress.id, title: `Implement first pass for ${project.name}`, priority: TaskPriority.P2, assignee: 'Bixi', position: 1 },
        { projectId: project.id, statusId: review.id, title: `Review current direction for ${project.name}`, priority: TaskPriority.P3, assignee: 'Alex', position: 2 },
      ],
    })
  }
}

main().finally(async () => prisma.$disconnect())
