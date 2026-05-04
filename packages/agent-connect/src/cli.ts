#!/usr/bin/env node
import { parseAgentConnectArgs, renderHelp } from './cli-options.js'
import { runHermesConnector } from './hermes-worker.js'

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    console.log(renderHelp())
    return 0
  }

  const args = parseAgentConnectArgs(argv)
  if (args.installService) {
    throw new Error('install-service is reserved for the public daemon installer and is not implemented yet.')
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
