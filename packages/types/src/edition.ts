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
  | 'system.backupsUi'
  | 'reports.crossWorkspace'

export type EditionInfo = {
  ok: boolean
  edition: SallyEdition
  availableFeatures: FeatureKey[]
  upgradeUrl: string
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
  'system.backupsUi',
  'reports.crossWorkspace',
] as const satisfies readonly FeatureKey[]
