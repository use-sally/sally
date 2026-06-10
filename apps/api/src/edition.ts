import type { FastifyReply, FastifyRequest } from 'fastify'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { COMMUNITY_FEATURES, CRM_PACK_FEATURES, ENTERPRISE_FEATURES, type EditionInfo, type FeatureKey, type LicenseCertificate, type LicenseInfo, type LicensePack, type SallyEdition } from '@sally/types'

export const ENTERPRISE_UPGRADE_URL = process.env.SALLY_ENTERPRISE_UPGRADE_URL || 'https://usesally.app/enterprise'
export const CRM_UPSELL_URL = process.env.SALLY_CRM_UPSELL_URL || process.env.SALLY_ENTERPRISE_UPGRADE_URL || 'https://usesally.com/crm'

const ACTIVE_LICENSE_STATUSES = new Set(['active', 'trialing', 'past_due'])

export type InstalledLicenseInput = {
  certificate: string
  publicKey: string
  licenseServerUrl?: string | null
  activationId?: string | null
  licenseId?: string | null
  instanceId?: string | null
  lastRefreshAt?: Date | string | null
} | null

function getLicensePublicKey(overridePublicKey?: string | null): string | null {
  return overridePublicKey?.replace(/\\n/g, '\n') || process.env.SALLY_LICENSE_PUBLIC_KEY?.replace(/\\n/g, '\n') || null
}

function readEnvOrFile(valueName: string, fileName: string): string | null {
  const directValue = process.env[valueName]?.trim()
  if (directValue) return directValue
  const filePath = process.env[fileName]?.trim()
  if (!filePath) return null
  try {
    return fs.readFileSync(filePath, 'utf8').trim()
  } catch {
    return null
  }
}

function readExtraFeatures(): FeatureKey[] {
  const raw = process.env.SALLY_EXTRA_FEATURES || process.env.SALLY_FEATURES || ''
  if (!raw.trim()) return []
  const known = new Set<FeatureKey>([...ENTERPRISE_FEATURES, ...CRM_PACK_FEATURES])
  return raw.split(',').map((feature) => feature.trim()).filter((feature): feature is FeatureKey => known.has(feature as FeatureKey))
}

function readExtraPacks(): LicensePack[] {
  const raw = process.env.SALLY_LICENSE_PACKS || process.env.SALLY_PACKS || ''
  if (!raw.trim()) return []
  return raw.split(',').map((pack) => pack.trim().toLowerCase()).filter((pack): pack is LicensePack => pack === 'crm')
}

function featuresForPacks(packs: LicensePack[] = []): FeatureKey[] {
  return packs.includes('crm') ? [...CRM_PACK_FEATURES] : []
}

function withExtraFeatures(features: FeatureKey[], packs: LicensePack[] = []) {
  const allPacks = [...new Set([...packs, ...readExtraPacks()])]
  return [...new Set([...features, ...featuresForPacks(allPacks), ...readExtraFeatures()])]
}

function withExtraPacks(packs: LicensePack[] = []) {
  return [...new Set([...packs, ...readExtraPacks()])]
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function splitCompactCertificate(raw: string): { certificateText: string; signature: string | null } | null {
  const trimmed = raw.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  try {
    return { certificateText: decodeBase64Url(parts[0]).toString('utf8'), signature: parts[1] }
  } catch {
    return null
  }
}

function normalizeCertificateText(raw: string): string {
  const trimmed = raw.trim()
  const compact = splitCompactCertificate(trimmed)
  if (compact) return compact.certificateText
  if (trimmed.startsWith('{')) return trimmed
  try {
    return decodeBase64Url(trimmed).toString('utf8')
  } catch {
    return trimmed
  }
}

function parseCertificate(raw: string): LicenseCertificate {
  const parsed = JSON.parse(normalizeCertificateText(raw)) as LicenseCertificate
  if (!parsed || typeof parsed !== 'object') throw new Error('License certificate is not an object')
  if (!parsed.licenseId || typeof parsed.licenseId !== 'string') throw new Error('License certificate is missing licenseId')
  if (parsed.edition !== 'ENTERPRISE' && parsed.edition !== 'COMMUNITY') throw new Error('License certificate has invalid edition')
  if (!Array.isArray(parsed.features)) throw new Error('License certificate is missing features')
  if (parsed.packs && (!Array.isArray(parsed.packs) || parsed.packs.some((pack) => pack !== 'crm'))) throw new Error('License certificate has invalid packs')
  if (!parsed.status || typeof parsed.status !== 'string') throw new Error('License certificate is missing status')
  if (!parsed.issuedAt || Number.isNaN(Date.parse(parsed.issuedAt))) throw new Error('License certificate has invalid issuedAt')
  if (!parsed.validUntil || Number.isNaN(Date.parse(parsed.validUntil))) throw new Error('License certificate has invalid validUntil')
  if (parsed.graceUntil && Number.isNaN(Date.parse(parsed.graceUntil))) throw new Error('License certificate has invalid graceUntil')
  return parsed
}

function resolveSignature(certificateText: string, signature?: string | null): string | null {
  const compact = splitCompactCertificate(certificateText)
  return signature?.trim() || compact?.signature || null
}

function verifyCertificateSignature(certificateText: string, signature: string | null, publicKeyOverride?: string | null): boolean {
  const publicKeyPem = getLicensePublicKey(publicKeyOverride)
  if (!publicKeyPem || !signature) return false
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem)
    return crypto.verify(null, Buffer.from(normalizeCertificateText(certificateText), 'utf8'), publicKey, decodeBase64Url(signature))
  } catch {
    return false
  }
}

function certificateIsUsable(certificate: LicenseCertificate, now = new Date()): boolean {
  if (!ACTIVE_LICENSE_STATUSES.has(certificate.status)) return false
  const graceOrValidUntil = certificate.graceUntil || certificate.validUntil
  return Date.parse(graceOrValidUntil) >= now.getTime()
}

function licenseInfoFromCertificate(certificate: LicenseCertificate, source: LicenseInfo['source'] = 'certificate'): LicenseInfo {
  return {
    source,
    status: certificate.status,
    licenseId: certificate.licenseId,
    customerEmail: certificate.customer?.email ?? null,
    companyName: certificate.customer?.companyName ?? null,
    instanceId: certificate.instanceId ?? null,
    validUntil: certificate.validUntil,
    graceUntil: certificate.graceUntil ?? null,
  }
}

function contextFromCertificate(input: { certificateRaw: string; signature?: string | null; publicKey?: string | null; source: LicenseInfo['source']; now: Date }) {
  const certificate = parseCertificate(input.certificateRaw)
  const signature = resolveSignature(input.certificateRaw, input.signature)
  if (!verifyCertificateSignature(input.certificateRaw, signature, input.publicKey)) throw new Error('License certificate signature verification failed')
  if (!certificateIsUsable(certificate, input.now)) throw new Error('License certificate is expired, canceled, or disabled')
  const packs = withExtraPacks(certificate.packs || [])
  return {
    edition: certificate.edition,
    features: withExtraFeatures(certificate.edition === 'ENTERPRISE' ? [...new Set([...ENTERPRISE_FEATURES, ...certificate.features])] : [...certificate.features], packs),
    packs,
    license: licenseInfoFromCertificate(certificate, input.source),
  }
}

export function getLicenseContext(options: { now?: Date; installedLicense?: InstalledLicenseInput } = {}): { edition: SallyEdition; features: FeatureKey[]; packs: LicensePack[]; license: LicenseInfo } {
  const now = options.now ?? new Date()
  if (process.env.SALLY_EDITION?.toLowerCase() === 'enterprise') {
    return {
      edition: 'ENTERPRISE',
      features: withExtraFeatures([...ENTERPRISE_FEATURES]),
      packs: withExtraPacks(),
      license: { source: 'env_override', status: 'active' },
    }
  }

  const certificateRaw = readEnvOrFile('SALLY_LICENSE_CERTIFICATE', 'SALLY_LICENSE_CERTIFICATE_FILE')
  const signature = readEnvOrFile('SALLY_LICENSE_SIGNATURE', 'SALLY_LICENSE_SIGNATURE_FILE')
  if (certificateRaw) {
    try {
      return contextFromCertificate({ certificateRaw, signature, source: 'certificate', now })
    } catch (error) {
      return {
        edition: 'COMMUNITY',
        features: withExtraFeatures([...COMMUNITY_FEATURES]),
        packs: withExtraPacks(),
        license: { source: 'community', status: 'invalid', error: error instanceof Error ? error.message : 'Invalid license certificate' },
      }
    }
  }

  if (options.installedLicense?.certificate && options.installedLicense.publicKey) {
    try {
      return contextFromCertificate({ certificateRaw: options.installedLicense.certificate, publicKey: options.installedLicense.publicKey, source: 'installed_certificate', now })
    } catch (error) {
      return {
        edition: 'COMMUNITY',
        features: withExtraFeatures([...COMMUNITY_FEATURES]),
        packs: withExtraPacks(),
        license: { source: 'community', status: 'invalid', error: error instanceof Error ? error.message : 'Invalid installed license certificate' },
      }
    }
  }

  return { edition: 'COMMUNITY', features: withExtraFeatures([...COMMUNITY_FEATURES]), packs: withExtraPacks(), license: { source: 'community', status: 'missing' } }
}

export function getSallyEdition(): SallyEdition {
  return getLicenseContext().edition
}

export function getAvailableFeatures(edition?: SallyEdition): FeatureKey[] {
  if (edition) return edition === 'ENTERPRISE' ? [...ENTERPRISE_FEATURES] : [...COMMUNITY_FEATURES]
  return getLicenseContext().features
}

export function hasFeature(feature: FeatureKey, edition?: SallyEdition): boolean {
  return getAvailableFeatures(edition).includes(feature)
}

export function getEditionInfo(options: { installedLicense?: InstalledLicenseInput } = {}): EditionInfo {
  const context = getLicenseContext(options)
  return {
    ok: true,
    edition: context.edition,
    availableFeatures: context.features,
    availablePacks: context.packs,
    upgradeUrl: ENTERPRISE_UPGRADE_URL,
    license: context.license,
  }
}

export function requireFeature(feature: FeatureKey, readInstalledLicense?: () => Promise<InstalledLicenseInput>) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    const installedLicense = readInstalledLicense ? await readInstalledLicense() : null
    if (getLicenseContext({ installedLicense }).features.includes(feature)) return
    return reply.code(402).send({
      ok: false,
      error: feature.startsWith('crm.') ? 'CRM add-on feature' : 'Enterprise feature',
      feature,
      upgradeUrl: feature.startsWith('crm.') ? CRM_UPSELL_URL : ENTERPRISE_UPGRADE_URL,
    })
  }
}
