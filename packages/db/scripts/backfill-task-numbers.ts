import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function backfillTaskNumbers() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } })
  console.log(`Found ${projects.length} projects to backfill`)

  for (const project of projects) {
    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, number: true },
    })

    const unnumbered = tasks.filter((t) => t.number === null)
    if (unnumbered.length === 0) {
      console.log(`  [${project.name}] — all ${tasks.length} tasks already numbered, skipping`)
      continue
    }

    console.log(`  [${project.name}] — backfilling ${unnumbered.length} of ${tasks.length} tasks`)

    const maxExisting = tasks.reduce((max, t) => (t.number && t.number > max ? t.number : max), 0)

    await prisma.$transaction(async (tx) => {
      let counter = maxExisting
      for (const task of unnumbered) {
        counter++
        await tx.task.update({ where: { id: task.id }, data: { number: counter } })
      }
      await tx.project.update({ where: { id: project.id }, data: { taskCounter: counter } })
    })

    console.log(`  [${project.name}] — done, counter set to ${maxExisting + unnumbered.length}`)
  }

  console.log('Backfill complete')
}

backfillTaskNumbers()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
