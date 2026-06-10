export type SallyEdition = 'COMMUNITY' | 'ENTERPRISE'

export type FeatureKey =
  | 'security.saml'
  | 'security.scim'
  | 'security.enforced2fa'
  | 'security.auditLog'
  | 'security.sessionPolicy'
  | 'security.apiMcpKeyPolicy'
  | 'team.customRoles'
  | 'team.groups'
  | 'automation.multipleAgents'
  | 'automation.workflowPolicies'
  | 'integrations.webhooks'
  | 'integrations.cloudStorage'
  | 'crm.core'
  | 'system.backupsUi'
  | 'reports.crossWorkspace'

export type LicenseStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'disabled'

export type LicenseCertificate = {
  licenseId: string
  edition: SallyEdition
  features: FeatureKey[]
  status: LicenseStatus
  customer?: { email?: string | null; companyName?: string | null } | null
  instanceId?: string | null
  seatLimit?: number | null
  workspaceLimit?: number | null
  issuedAt: string
  validUntil: string
  graceUntil?: string | null
}

export type LicenseInfo = {
  source: 'community' | 'env_override' | 'certificate' | 'installed_certificate'
  status?: LicenseStatus | 'invalid' | 'missing'
  licenseId?: string | null
  customerEmail?: string | null
  companyName?: string | null
  instanceId?: string | null
  validUntil?: string | null
  graceUntil?: string | null
  error?: string | null
}

export type EditionInfo = {
  ok: boolean
  edition: SallyEdition
  availableFeatures: FeatureKey[]
  upgradeUrl: string
  license?: LicenseInfo
}

export const COMMUNITY_FEATURES = [] as const satisfies readonly FeatureKey[]

export const ENTERPRISE_FEATURES = [
  'security.saml',
  'security.scim',
  'security.enforced2fa',
  'security.auditLog',
  'security.sessionPolicy',
  'security.apiMcpKeyPolicy',
  'team.customRoles',
  'team.groups',
  'automation.multipleAgents',
  'automation.workflowPolicies',
  'integrations.webhooks',
  'integrations.cloudStorage',
  'system.backupsUi',
  'reports.crossWorkspace',
] as const satisfies readonly FeatureKey[]
