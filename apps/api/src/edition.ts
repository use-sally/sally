import type { FastifyReply, FastifyRequest } from 'fastify'
import { COMMUNITY_FEATURES, ENTERPRISE_FEATURES, type EditionInfo, type FeatureKey, type SallyEdition } from '@sally/types'

export const ENTERPRISE_UPGRADE_URL = process.env.SALLY_ENTERPRISE_UPGRADE_URL || 'https://usesally.app/enterprise'

export function getSallyEdition(): SallyEdition {
  return process.env.SALLY_EDITION?.toLowerCase() === 'enterprise' ? 'ENTERPRISE' : 'COMMUNITY'
}

export function getAvailableFeatures(edition: SallyEdition = getSallyEdition()): FeatureKey[] {
  return edition === 'ENTERPRISE' ? [...ENTERPRISE_FEATURES] : [...COMMUNITY_FEATURES]
}

export function hasFeature(feature: FeatureKey, edition: SallyEdition = getSallyEdition()): boolean {
  return getAvailableFeatures(edition).includes(feature)
}

export function getEditionInfo(): EditionInfo {
  return {
    ok: true,
    edition: getSallyEdition(),
    availableFeatures: getAvailableFeatures(),
    upgradeUrl: ENTERPRISE_UPGRADE_URL,
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
