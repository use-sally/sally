export const COMMUNITY_FEATURES = [
  'core.workspaces',
  'core.teamBasic',
  'core.projects',
  'core.tasksBoard',
  'core.clients',
  'core.timesheets',
  'core.localAuth',
  'core.basicAutomation',
]

export const ENTERPRISE_FEATURES = [
  ...COMMUNITY_FEATURES,
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
  'reports.crossWorkspace',
  'system.backupsUi',
]
