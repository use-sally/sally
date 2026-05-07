import type { EditionInfo, FeatureKey } from '@sally/types/src'
import { getEdition as getEditionFromApi } from './api'

export type { EditionInfo, FeatureKey }

export async function getEdition(): Promise<EditionInfo> {
  return getEditionFromApi()
}

export function hasFeature(edition: EditionInfo | null | undefined, feature: FeatureKey): boolean {
  return !!edition?.availableFeatures?.includes(feature)
}
