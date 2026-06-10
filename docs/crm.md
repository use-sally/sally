# Sally CRM add-on

Sally CRM is planned as an optional add-on module for lightweight, API/MCP-first customer relationship management.

The goal is not to clone a large CRM suite. The goal is a Sally-style operational CRM that is simple for humans and excellent for agents.

## Add-on feature key

The CRM add-on is gated by the feature key:

```txt
crm.core
```

When the feature is disabled:
- the web app shows a locked CRM add-on page
- `/crm` API routes return a feature-unavailable response
- hosted MCP does not list CRM tools

When the feature is enabled:
- `/crm` API routes are available
- hosted MCP can expose `crm.*` tools
- the web UI can show CRM surfaces

## Current foundation

The current foundation adds the add-on boundary:

- `FeatureKey`: `crm.core`
- API gate: `GET /crm`
- web route: `/crm`
- hosted MCP gated tool: `crm.addon.info`

This is intentionally a foundation. CRM data models and CRUD tools should be added behind the same feature boundary.

## Planned headless CRM model

Recommended CRM entities:

### Organizations
Companies, customers, vendors, or accounts.

Suggested fields:
- workspace ID
- name
- website
- notes
- labels
- owner account ID
- archived timestamp

### People
Contacts associated with organizations.

Suggested fields:
- workspace ID
- organization ID
- name
- email
- phone
- title/role
- notes
- labels
- archived timestamp

### Deals
Opportunities or commercial workflows.

Suggested fields:
- workspace ID
- organization ID
- primary person ID
- title
- value
- currency
- stage
- status: open/won/lost
- expected close date
- linked Sally project ID
- notes

### Activities
A timeline of CRM interactions.

Suggested fields:
- workspace ID
- organization/person/deal references
- type: note/call/email/meeting/follow-up
- body
- actor account ID
- created timestamp
- optional linked Sally task ID

## Planned API shape

Use a dedicated `/crm` prefix:

```txt
GET    /crm/organizations
POST   /crm/organizations
GET    /crm/organizations/:organizationId
PATCH  /crm/organizations/:organizationId

GET    /crm/people
POST   /crm/people
GET    /crm/people/:personId
PATCH  /crm/people/:personId

GET    /crm/deals
POST   /crm/deals
GET    /crm/deals/:dealId
PATCH  /crm/deals/:dealId

GET    /crm/activities
POST   /crm/activities
```

All CRM routes should be workspace-scoped and should use Sally's normal workspace selector headers/query params.

## Planned MCP tools

Recommended hosted MCP tools:

```txt
crm.organization.list
crm.organization.get
crm.organization.create
crm.organization.update
crm.person.list
crm.person.get
crm.person.create
crm.person.update
crm.deal.list
crm.deal.get
crm.deal.create
crm.deal.update
crm.activity.list
crm.activity.add
crm.search
crm.addon.info
```

MCP tool listing should remain dynamic: only list CRM tools when `crm.core` is enabled.

## Permissions

Initial recommended permission model:

- workspace `OWNER`: full CRM management
- workspace `MEMBER`: create/update CRM records and activities
- workspace `VIEWER`: read-only CRM access if viewer access is enabled for CRM later
- platform `ADMIN`/`SUPERADMIN`: elevated access for administration

If CRM records later need more privacy, add record ownership or custom sharing as a second phase.

## Sally project bridge

CRM should connect to Sally project management rather than duplicate it.

Useful bridges:
- create a Sally project from a won deal
- link a deal to a Sally project
- create Sally tasks from CRM follow-ups
- show linked projects/tasks on organization and deal pages
- add CRM activity when important project milestones happen

## Product principle

Sally CRM should remain:

- lightweight
- workspace-scoped
- API/MCP-first
- automation-friendly
- easy to reason about

Avoid features that create a heavyweight CRM before the headless model is solid.
