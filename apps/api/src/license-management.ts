import type { InstalledLicenseInput } from './edition.js'

export const DEFAULT_LICENSE_SERVER_URL = 'https://usesally.com'
export const INSTALLED_LICENSE_ID = 'instance'

type LicenseServerResponse = {
  ok?: boolean
  error?: string
  license?: { id?: string; status?: string; validUntil?: string | null }
  activationId?: string
  certificate?: string
  publicKey?: string
  refreshAfter?: string
}

type InstalledLicenseRecord = InstalledLicenseInput & {
  id?: string
  licenseServerUrl?: string | null
  activationId?: string | null
  licenseId?: string | null
  instanceId?: string | null
  status?: string | null
  validUntil?: Date | string | null
  graceUntil?: Date | string | null
  lastRefreshAt?: Date | string | null
}

type InstalledLicenseStore = {
  installedLicense: {
    findUnique(args: unknown): Promise<InstalledLicenseRecord | null>
    upsert(args: unknown): Promise<InstalledLicenseRecord>
    deleteMany(args: unknown): Promise<{ count: number }>
  }
}

export function getConfiguredLicenseServerUrl() {
  return (process.env.SALLY_LICENSE_SERVER_URL || DEFAULT_LICENSE_SERVER_URL).replace(/\/+$/, '')
}

function normalizeInstanceId(input?: string | null) {
  const trimmed = input?.trim()
  return trimmed || process.env.SALLY_INSTANCE_ID?.trim() || 'default'
}

function decodeBase64UrlJson(input: string) {
  const compactPayload = input.trim().split('.')[0]
  if (!compactPayload) return null
  try {
    return JSON.parse(Buffer.from(compactPayload, 'base64url').toString('utf8')) as { licenseId?: string; status?: string; instanceId?: string; validUntil?: string; graceUntil?: string }
  } catch {
    return null
  }
}

function buildStoredLicense(input: { licenseServerUrl: string; response: LicenseServerResponse; instanceId: string; lastRefreshAt?: Date }) {
  if (!input.response.certificate || !input.response.publicKey) throw new Error('License server response did not include a certificate and public key')
  const certificate = decodeBase64UrlJson(input.response.certificate)
  const validUntil = input.response.license?.validUntil || certificate?.validUntil || null
  return {
    id: INSTALLED_LICENSE_ID,
    licenseServerUrl: input.licenseServerUrl,
    certificate: input.response.certificate,
    publicKey: input.response.publicKey,
    activationId: input.response.activationId ?? null,
    licenseId: input.response.license?.id ?? certificate?.licenseId ?? null,
    instanceId: certificate?.instanceId ?? input.instanceId,
    status: input.response.license?.status ?? certificate?.status ?? null,
    validUntil: validUntil ? new Date(validUntil) : null,
    graceUntil: certificate?.graceUntil ? new Date(certificate.graceUntil) : null,
    lastRefreshAt: input.lastRefreshAt ?? null,
  }
}

async function postLicenseServer(path: string, payload: unknown, licenseServerUrl: string): Promise<LicenseServerResponse> {
  const response = await fetch(`${licenseServerUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({})) as LicenseServerResponse
  if (!response.ok || data.ok === false) throw new Error(data.error || `License server request failed (${response.status})`)
  return data
}

export async function readInstalledLicense(prisma: InstalledLicenseStore): Promise<InstalledLicenseInput> {
  const record = await prisma.installedLicense.findUnique({ where: { id: INSTALLED_LICENSE_ID } })
  if (!record?.certificate || !record.publicKey) return null
  return {
    certificate: record.certificate,
    publicKey: record.publicKey,
    licenseServerUrl: record.licenseServerUrl ?? null,
    activationId: record.activationId ?? null,
    licenseId: record.licenseId ?? null,
    instanceId: record.instanceId ?? null,
    lastRefreshAt: record.lastRefreshAt ?? null,
  }
}

export async function activateInstalledLicense(prisma: InstalledLicenseStore, input: { licenseKey: string; instanceId?: string | null; instanceName?: string | null; appVersion?: string | null; fingerprint?: string | null }) {
  const licenseKey = input.licenseKey.trim()
  if (!licenseKey) throw new Error('licenseKey is required')
  const licenseServerUrl = getConfiguredLicenseServerUrl()
  const instanceId = normalizeInstanceId(input.instanceId)
  const response = await postLicenseServer('/api/licenses/activate', {
    licenseKey,
    instanceId,
    instanceName: input.instanceName ?? process.env.SALLY_INSTANCE_NAME ?? null,
    appVersion: input.appVersion ?? process.env.npm_package_version ?? null,
    fingerprint: input.fingerprint ?? null,
  }, licenseServerUrl)
  const data = buildStoredLicense({ licenseServerUrl, response, instanceId })
  const license = await prisma.installedLicense.upsert({
    where: { id: INSTALLED_LICENSE_ID },
    update: data,
    create: data,
  })
  return { ok: true, license }
}

export async function refreshInstalledLicense(prisma: InstalledLicenseStore) {
  const current = await prisma.installedLicense.findUnique({ where: { id: INSTALLED_LICENSE_ID } })
  if (!current?.certificate || !current.publicKey || !current.licenseId || !current.activationId || !current.instanceId) throw new Error('No installed license to refresh')
  const licenseServerUrl = getConfiguredLicenseServerUrl()
  const response = await postLicenseServer('/api/licenses/refresh', {
    licenseId: current.licenseId,
    activationId: current.activationId,
    instanceId: current.instanceId,
    currentCertificate: current.certificate,
  }, licenseServerUrl)
  const data = buildStoredLicense({ licenseServerUrl, response, instanceId: current.instanceId, lastRefreshAt: new Date() })
  const license = await prisma.installedLicense.upsert({
    where: { id: INSTALLED_LICENSE_ID },
    update: data,
    create: data,
  })
  return { ok: true, license }
}

export async function removeInstalledLicense(prisma: InstalledLicenseStore) {
  await prisma.installedLicense.deleteMany({ where: { id: INSTALLED_LICENSE_ID } })
  return { ok: true }
}
