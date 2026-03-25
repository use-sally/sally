import TelegramBot from 'node-telegram-bot-api'
import { PrismaClient } from '@prisma/client'

let bot: TelegramBot | null = null

export function startTelegram(prisma: PrismaClient) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID

  if (!token || !allowedUserId) {
    console.log('[telegram] disabled: missing TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID')
    return null
  }

  if (bot) {
    console.log('[telegram] already running')
    return bot
  }

  console.log('[telegram] starting polling bot')
  bot = new TelegramBot(token, { polling: true })

  bot.on('polling_error', (err: Error) => {
    console.error('[telegram] polling_error', err.message)
  })

  bot.on('webhook_error', (err: Error) => {
    console.error('[telegram] webhook_error', err.message)
  })

  bot.on('message', async (msg: TelegramBot.Message) => {
    try {
      const chatId = msg.chat.id
      const userId = String(msg.from?.id ?? '')
      const text = msg.text?.trim() ?? ''
      console.log(`[telegram] message from=${userId} chat=${chatId} text=${text}`)

      if (userId !== allowedUserId) {
        await bot?.sendMessage(chatId, 'Unauthorized.')
        return
      }

      if (text === '/start' || text === '/help') {
        await bot?.sendMessage(chatId, [
          'sally_ bot',
          '',
          '/projects - list projects',
          '/summary - project summary',
          '/tasks - list first tasks',
        ].join('\n'))
        return
      }

      if (text === '/summary') {
        const [projects, tasks] = await Promise.all([
          prisma.project.count(),
          prisma.task.count(),
        ])
        await bot?.sendMessage(chatId, `Projects: ${projects}\nTasks: ${tasks}`)
        return
      }

      if (text === '/projects') {
        const projects = await prisma.project.findMany({ orderBy: { createdAt: 'asc' } })
        const lines = projects.map((p, i) => `${i + 1}. ${p.name}`)
        await bot?.sendMessage(chatId, lines.length ? lines.join('\n') : 'No projects found.')
        return
      }

      if (text === '/tasks') {
        const tasks = await prisma.task.findMany({ take: 10, orderBy: { createdAt: 'asc' } })
        const lines = tasks.map((t, i) => `${i + 1}. ${t.title}`)
        await bot?.sendMessage(chatId, lines.length ? lines.join('\n') : 'No tasks found.')
        return
      }

      await bot?.sendMessage(chatId, 'Unknown command. Use /help')
    } catch (error) {
      console.error('[telegram] handler_error', error)
    }
  })

  return bot
}
