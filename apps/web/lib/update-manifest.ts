export type UpdateManifest = {
  product: string
  channel: string
  latestVersion: string
  publishedAt?: string
  minimumSupportedVersion?: string
  breaking?: boolean
  security?: boolean
  title?: string
  summary?: string
  highlights?: string[]
  breakingChanges?: string[]
  upgradeUrl?: string
  downloadUrl?: string
  docsUrl?: string
}

export const updateManifestUrl = process.env.NEXT_PUBLIC_UPDATE_MANIFEST_URL || 'https://usesally.com/api/updates/latest.json'

export function normalizeVersion(input: string) {
  return input.trim().replace(/^v/i, '')
}

export function compareVersions(a: string, b: string) {
  const pa = normalizeVersion(a).split(/[^0-9]+/).filter(Boolean).map(Number)
  const pb = normalizeVersion(b).split(/[^0-9]+/).filter(Boolean).map(Number)
  const length = Math.max(pa.length, pb.length)
  for (let index = 0; index < length; index += 1) {
    const av = pa[index] ?? 0
    const bv = pb[index] ?? 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}
