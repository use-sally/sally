import type { FastifyReply, FastifyRequest } from 'fastify'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { COMMUNITY_FEATURES, ENTERPRISE_FEATURES, type EditionInfo, type FeatureKey, type LicenseCertificate, type LicenseInfo, type SallyEdition } from '@sally/types'

export const ENTERPRISE_UPGRADE_URL = process.env.SALLY_ENTERPRISE_UPGRADE_URL || 'https://usesally.app/enterprise'

const ACTIVE_LICENSE_STATUSES = new Set(['active', 'trialing', 'past_due'])
function getLicensePublicKey(): string | null {
  return process.env.SALLY_LICENSE_PUBLIC_KEY?.replace(/\\n/g, '\n') || null
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

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function normalizeCertificateText(raw: string): string {
  const trimmed = raw.trim()
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
  if (!parsed.status || typeof parsed.status !== 'string') throw new Error('License certificate is missing status')
  if (!parsed.issuedAt || Number.isNaN(Date.parse(parsed.issuedAt))) throw new Error('License certificate has invalid issuedAt')
  if (!parsed.validUntil || Number.isNaN(Date.parse(parsed.validUntil))) throw new Error('License certificate has invalid validUntil')
  if (parsed.graceUntil && Number.isNaN(Date.parse(parsed.graceUntil))) throw new Error('License certificate has invalid graceUntil')
  return parsed
}

function verifyCertificateSignature(certificateText: string, signature: string): boolean {
  const publicKeyPem = getLicensePublicKey()
  if (!publicKeyPem) return false
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

function licenseInfoFromCertificate(certificate: LicenseCertificate): LicenseInfo {
  return {
    source: 'certificate',
    status: certificate.status,
    licenseId: certificate.licenseId,
    customerEmail: certificate.customer?.email ?? null,
    companyName: certificate.customer?.companyName ?? null,
    instanceId: certificate.instanceId ?? null,
    validUntil: certificate.validUntil,
    graceUntil: certificate.graceUntil ?? null,
  }
}

export function getLicenseContext(now = new Date()): { edition: SallyEdition; features: FeatureKey[]; license: LicenseInfo } {
  if (process.env.SALLY_EDITION?.toLowerCase() === 'enterprise') {
    return {
      edition: 'ENTERPRISE',
      features: [...ENTERPRISE_FEATURES],
      license: { source: 'env_override', status: 'active' },
    }
  }

  const certificateRaw = readEnvOrFile('SALLY_LICENSE_CERTIFICATE', 'SALLY_LICENSE_CERTIFICATE_FILE')
  const signature = readEnvOrFile('SALLY_LICENSE_SIGNATURE', 'SALLY_LICENSE_SIGNATURE_FILE')
  if (!certificateRaw || !signature) {
    return { edition: 'COMMUNITY', features: [...COMMUNITY_FEATURES], license: { source: 'community', status: 'missing' } }
  }

  try {
    const certificate = parseCertificate(certificateRaw)
    if (!verifyCertificateSignature(certificateRaw, signature)) throw new Error('License certificate signature verification failed')
    if (!certificateIsUsable(certificate, now)) throw new Error('License certificate is expired, canceled, or disabled')
    return {
      edition: certificate.edition,
      features: certificate.edition === 'ENTERPRISE' ? [...new Set([...ENTERPRISE_FEATURES, ...certificate.features])] : [...certificate.features],
      license: licenseInfoFromCertificate(certificate),
    }
  } catch (error) {
    return {
      edition: 'COMMUNITY',
      features: [...COMMUNITY_FEATURES],
      license: { source: 'community', status: 'invalid', error: error instanceof Error ? error.message : 'Invalid license certificate' },
    }
  }
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

export function getEditionInfo(): EditionInfo {
  const context = getLicenseContext()
  return {
    ok: true,
    edition: context.edition,
    availableFeatures: context.features,
    upgradeUrl: ENTERPRISE_UPGRADE_URL,
    license: context.license,
  }
}

export function requireFeature(feature: FeatureKey) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    if (hasFeature(feature)) return
    return reply.code(402).send({
      ok: false,
      error: 'Enterprise feature',
      feature,
      upgradeUrl: ENTERPRISE_UPGRADE_URL,
    })
  }
}
