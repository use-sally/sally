#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAgentConnectArgs, renderHelp, type AgentConnectArgs } from './cli-options.js'
import { runHermesConnector } from './hermes-worker.js'

function withoutBackgroundFlag(argv: string[]) {
  return argv.filter((item) => item !== '--background')
}

function startBackgroundConnector(args: AgentConnectArgs, argv: string[]) {
  fs.mkdirSync(path.dirname(args.pidFile), { recursive: true, mode: 0o700 })
  fs.mkdirSync(path.dirname(args.logFile), { recursive: true, mode: 0o700 })
  const logFd = fs.openSync(args.logFile, 'a', 0o600)
  const cliPath = fileURLToPath(import.meta.url)
  const child = spawn(process.execPath, [cliPath, ...withoutBackgroundFlag(argv)], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      SALLY_WORKER_BACKGROUND_CHILD: '1',
      SALLY_WORKER_BACKGROUND: '0',
    },
  })
  child.unref()
  fs.writeFileSync(args.pidFile, `${child.pid}\n`, { mode: 0o600 })
  fs.closeSync(logFd)
  console.log(JSON.stringify({
    ok: true,
    mode: 'background',
    runtime: args.runtime,
    pid: child.pid,
    pidFile: args.pidFile,
    logFile: args.logFile,
  }, null, 2))
  return 0
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    console.log(renderHelp())
    return 0
  }

  const args = parseAgentConnectArgs(argv)
  if (args.installService) {
    throw new Error('install-service is reserved for the public daemon installer and is not implemented yet.')
  }
  if (args.background && process.env.SALLY_WORKER_BACKGROUND_CHILD !== '1') {
    return startBackgroundConnector(args, argv)
  }
  return runHermesConnector(args)
}

main().then((code) => {
  process.exitCode = code
}).catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  if (message.startsWith('Sally agent connector')) console.log(message)
  else console.error(message)
  process.exitCode = 1
})
