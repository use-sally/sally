import rootPackage from '../../../package.json'

const packageVersion = typeof rootPackage.version === 'string' ? rootPackage.version : '0.0.0'

export const appVersion = process.env.NEXT_PUBLIC_SALLY_VERSION || packageVersion
export const appGitSha = process.env.NEXT_PUBLIC_SALLY_GIT_SHA || ''
export const appBuildTime = process.env.NEXT_PUBLIC_SALLY_BUILD_TIME || ''

export function appVersionLabel() {
  return appGitSha ? `${appVersion}+${appGitSha.slice(0, 7)}` : appVersion
}
