import { marked } from 'marked'

export type DocSnippet = {
  id: string
  title: string
  language: 'bash' | 'json' | 'http' | 'text'
  code: string
}

export type DocPage = {
  slug: string[]
  title: string
  description: string
  section: 'installer' | 'api' | 'mcp' | 'usage'
  markdown: string
  snippets?: string[]
}

export type DocSection = {
  id: DocPage['section']
  title: string
  description: string
}

export const docSections: DocSection[] = [
  { id: 'installer', title: 'Installer', description: 'Install, update, doctor, and deployment modes.' },
  { id: 'api', title: 'API', description: 'Authentication, workspace context, and core resources.' },
  { id: 'mcp', title: 'MCP', description: 'Hosted MCP as the primary path, with legacy stdio notes.' },
  { id: 'usage', title: 'End-User Usage', description: 'How humans use Sally day to day.' },
]

export const docSnippets: DocSnippet[] = [
  {
    id: 'install-basic',
    title: 'Install Sally',
    language: 'bash',
    code: 'npx --yes create-sally@latest',
  },
  {
    id: 'install-managed-noninteractive',
    title: 'Non-interactive managed-simple install',
    language: 'bash',
    code: `npx --yes create-sally@latest install \\
  --mode managed-simple \\
  --dir /opt/sally-instance \\
  --domain sally.example.com \\
  --workspace Operations \\
  --superadmin-email owner@example.com \\
  --superadmin-name "Sally Admin" \\
  --acme-email owner@example.com \\
  --email-setup later \\
  --version latest \\
  --yes`,
  },
  {
    id: 'update-basic',
    title: 'Update Sally',
    language: 'bash',
    code: 'npx --yes create-sally@latest update',
  },
  {
    id: 'doctor-basic',
    title: 'Check an existing install',
    language: 'bash',
    code: 'npx --yes create-sally@latest doctor --dir /opt/sally-instance',
  },
  {
    id: 'api-auth',
    title: 'API auth with bearer token',
    language: 'bash',
    code: `curl https://your-sally-domain.com/api/projects \\
  -H 'Authorization: Bearer sally_...' \\
  -H 'X-Workspace-Slug: operations'`,
  },
  {
    id: 'api-projects',
    title: 'List projects',
    language: 'bash',
    code: `curl https://your-sally-domain.com/api/projects \\
  -H 'Authorization: Bearer sally_...' \\
  -H 'X-Workspace-Slug: operations'`,
  },
  {
    id: 'api-tasks',
    title: 'Create a task',
    language: 'bash',
    code: `curl -X POST https://your-sally-domain.com/api/tasks \\
  -H 'Authorization: Bearer sally_...' \\
  -H 'X-Workspace-Slug: operations' \\
  -H 'Content-Type: application/json' \\
  --data '{
    "title":"Follow up on client onboarding",
    "projectId":"project_123"
  }'`,
  },
  {
    id: 'mcp-initialize',
    title: 'Hosted MCP initialize',
    language: 'json',
    code: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": {
      "name": "manual-test",
      "version": "1.0.0"
    }
  }
}`,
  },
  {
    id: 'mcp-curl',
    title: 'Hosted MCP request',
    language: 'bash',
    code: `curl -X POST https://your-sally-domain.com/mcp \\
  -H 'Authorization: Bearer sallymcp_...' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  --data @initialize.json`,
  },
  {
    id: 'usage-login',
    title: 'Open Sally',
    language: 'text',
    code: `1. Sign in to your Sally workspace.
2. Pick a workspace if you belong to more than one.
3. Open Projects, Tasks, Clients, or Timesheets from the left navigation.`,
  },
]

export const docPages: DocPage[] = [
  {
    slug: ['installer', 'overview'],
    title: 'Installer Overview',
    description: 'Install, update, and operate Sally through create-sally.',
    section: 'installer',
    snippets: ['install-basic', 'install-managed-noninteractive', 'update-basic', 'doctor-basic'],
    markdown: `## What this covers

Sally is installed and updated through **create-sally**.

The installer is the official operator entrypoint for:

- fresh installs
- guided updates
- deployment checks via \`doctor\`
- non-interactive provisioning

## Public commands

### Install Sally

\`npx --yes create-sally@latest\`

### Update Sally

\`npx --yes create-sally@latest update\`

### Check an existing install

\`npx --yes create-sally@latest doctor --dir /opt/sally-instance\`

## Install modes

### managed-simple

Use this when you want the fastest supported path.

It sets up:

- Docker
- Postgres
- HTTPS via Caddy
- Sally API and web containers

### existing-infra

Use this when Sally needs to fit into your existing hosting decisions.

Typical cases:

- custom reverse proxy
- existing TLS setup
- custom deployment conventions

## Update model

The updater currently supports installs created by \`create-sally\`.

It will:

1. detect the install directory
2. read current mode and image tag
3. update managed image references
4. pull images
5. apply schema changes
6. rerun bootstrap safely
7. restart services
8. verify health

## Version model

- \`create-sally\` has its own npm package version.
- The Sally application itself has a separate version lifecycle.
- Updating \`create-sally\` updates the installer tool.
- Updating a running Sally instance updates the deployed Sally images.

## Current support scope

Installer-managed deployments are the supported path.

Custom hand-edited Docker stacks are intentionally outside the normal update scope for now.
`,
  },
  {
    slug: ['api', 'overview'],
    title: 'API Overview',
    description: 'How the Sally API is structured today and how to authenticate against it.',
    section: 'api',
    snippets: ['api-auth', 'api-projects', 'api-tasks'],
    markdown: `## Product reality

Sally has a real HTTP API behind the web app.

The API is the implementation-backed source of truth for:

- workspaces and memberships
- projects and project members
- tasks, labels, comments, due dates, and checklists
- clients
- notifications and notification preferences
- timesheets and reporting
- personal API keys and hosted MCP keys

## Authentication

Typical API calls use a bearer token.

You should assume that workspace context matters when reading or mutating data.

## Workspace context

When a user belongs to multiple workspaces, API usage should be explicit about the workspace being targeted.

In docs and examples, show workspace context clearly instead of relying on hidden defaults.

## Core resource groups

### Workspaces
- workspace selection
- memberships
- invites
- roles

### Projects
- create/list/update projects
- status tracking
- project membership
- activity

### Tasks
- create/update tasks
- comments
- labels
- due dates
- checklists

### Operations
- notifications
- timesheets
- clients

## Documentation rule

The website docs should stay aligned with the actual API and avoid aspirational endpoints.

If a flow is not implemented, do not document it as if it already exists.
`,
  },
  {
    slug: ['mcp', 'overview'],
    title: 'MCP Overview',
    description: 'Hosted MCP is the primary path for agent integration.',
    section: 'mcp',
    snippets: ['mcp-curl', 'mcp-initialize'],
    markdown: `## Primary path

Hosted MCP inside Sally is the primary MCP product path.

That means the normal flow is:

1. create a hosted MCP key inside Sally
2. point your MCP client at \`https://your-domain.com/mcp\`
3. authenticate with \`Authorization: Bearer sallymcp_...\`
4. initialize the MCP session
5. list and call tools

## Why hosted MCP is primary

Hosted MCP is better than leading users into local wrappers by default.

It gives you:

- real Sally permissions
- user-bound access
- optional workspace restriction at the key level
- one consistent operator path

## Local stdio MCP

\`sally-mcp\` still exists, but it should be documented as an advanced or legacy path.

Do not position it as the default onboarding flow.

## Docs rule

The MCP docs should separate:

- hosted MCP quickstart
- hosted MCP authentication
- initialize/list-tools/call-tool examples
- local stdio MCP for advanced setups only
`,
  },
  {
    slug: ['usage', 'overview'],
    title: 'End-User Usage Overview',
    description: 'What humans actually do in Sally today.',
    section: 'usage',
    snippets: ['usage-login'],
    markdown: `## What this section is for

These docs are for humans using Sally in the product, not operators installing it and not developers integrating with the API.

## Current product areas

### Workspaces
- switch workspaces
- manage members
- invite people
- understand roles

### Projects
- create and update projects
- track status
- manage project members
- review activity

### Tasks
- create tasks
- assign work
- add labels
- comment
- set due dates
- use checklists
- view inline images in task content

### Clients
- create clients
- link clients to projects

### Timesheets
- log time
- review reporting views

### Notifications
- review notification preferences
- stay current on task and project activity

### Keys and integrations
- manage personal API keys
- manage hosted MCP keys

## Documentation rule

The usage docs should be practical and operational.

Write them like a clean product manual, not marketing copy.
`,
  },
]

function slugKey(slug: string[]) {
  return slug.join('/')
}

export function getDocPage(slugParts?: string[]) {
  const normalized = slugParts && slugParts.length > 0 ? slugParts : ['installer', 'overview']
  return docPages.find((page) => slugKey(page.slug) === slugKey(normalized)) || null
}

export function getSectionPages(section: DocPage['section']) {
  return docPages.filter((page) => page.section === section)
}

export function getDocSnippet(id: string) {
  return docSnippets.find((snippet) => snippet.id === id) || null
}

export function renderDocMarkdown(markdown: string) {
  const html = marked.parse(markdown, { async: false, breaks: false })
  return typeof html === 'string' ? html : ''
}
