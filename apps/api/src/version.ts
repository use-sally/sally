import fs from 'node:fs'
import path from 'node:path'

function readPackageVersion() {
  const packagePath = path.resolve(process.cwd(), 'package.json')
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const appVersion = process.env.SALLY_VERSION || readPackageVersion()
export const appGitSha = process.env.SALLY_GIT_SHA || ''
export const appBuildTime = process.env.SALLY_BUILD_TIME || ''

export function appVersionLabel() {
  return appGitSha ? `${appVersion}+${appGitSha.slice(0, 7)}` : appVersion
}
