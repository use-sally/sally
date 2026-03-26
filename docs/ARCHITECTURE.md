# Sally architecture

This document explains the current repository structure and the architectural direction behind Sally.

It is intentionally short enough to stay readable, but detailed enough to orient both humans and LLMs.

## Product shape

Sally is a TypeScript-first project management system with three main surfaces:
- **web app** for human operators
- **HTTP API** for integrations and automation
- **MCP interfaces** for agent tooling

The design goal is not “maximum features”.
The design goal is a clean operational core with a real programmable interface.

## Monorepo layout

### Apps
- `apps/web` — Next.js application used by humans
- `apps/api` — Fastify API and hosted MCP server
- `apps/create-sally` — installer/bootstrap package
- `apps/mcp` — local stdio MCP server package

### Packages
- `packages/db` — Prisma schema and DB client
- `packages/types` — shared TypeScript types/contracts
- `packages/ui` — shared UI pieces

## Runtime boundaries

### Web app (`apps/web`)
Responsibilities:
- login and session-driven product UI
- workspace selection
- project/task/client/timesheet views
- profile and notification controls
- low-noise operator workflows

The web app talks to the API over HTTP and should be treated as a client of the API, not a privileged bypass.

### API (`apps/api`)
Responsibilities:
- auth and session handling
- API key and hosted MCP key validation
- workspace/project/task/client/timesheet routes
- notification handling
- upload handling
- hosted MCP endpoint at `/mcp`
- permission enforcement
- activity logging

The API is the main source of truth for business logic.

### Installer (`apps/create-sally`)
Responsibilities:
- guided setup for new instances
- managed-simple and existing-infra flows
- writing deployment config
- bootstrapping first workspace and superadmin

### Local stdio MCP (`apps/mcp`)
Responsibilities:
- expose Sally functionality to stdio MCP clients
- authenticate to Sally via user API key or hosted MCP key
- translate tool calls into normal Sally HTTP API calls

## Data model direction

At a high level, the product is centered around:
- accounts
- workspaces
- workspace memberships
- projects
- project memberships
- statuses
- tasks
- labels
- todos
- comments
- notifications
- clients
- timesheets
- API keys / MCP keys / sessions

The relational source of truth is Prisma in `packages/db/prisma/schema.prisma`.

## Permission model

Permissions are layered:

1. **platform role**
   - `NONE`
   - `SUPERADMIN`

2. **workspace role**
   - `OWNER`
   - `MEMBER`
   - `VIEWER`

3. **project role**
   - `OWNER`
   - `MEMBER`
   - `VIEWER`

Key idea:
- the same data is visible through web, API, and MCP
- permissions should stay consistent across all surfaces
- MCP is not a bypass layer

## Auth model

Sally currently supports:
- browser/session auth
- personal API keys (`atpm_...`)
- hosted MCP keys (`sallymcp_...`)
- optional global bootstrap token via env

This gives a clean separation between:
- human login flows
- script/agent credentials
- hosted MCP access

## Why hosted MCP lives inside the API

Hosted MCP is implemented in the API instead of as a separate service so that it can:
- reuse the existing permission model
- reuse real HTTP handlers/business rules
- inherit the same auth/account/workspace logic
- avoid a second shadow integration layer

This reduces drift and makes MCP behavior easier to reason about.

## Design principles

### 1. TypeScript-first
The product is intentionally built around one language and a shared type system.

### 2. API-first
The API is not an afterthought or an “enterprise add-on”. It is part of the product core.

### 3. Human + agent parity
Humans use the web app.
Agents use API or MCP.
Neither surface should require the other to exist as a workaround.

### 4. Low-noise UI
The UI should help operators move fast, not bury them under decorative layers.

### 5. Self-hostable operational core
Sally is designed to run on infrastructure teams control.

## Request flow summary

### Human flow
Browser → Next.js web app → Sally API → Prisma/Postgres

### API integration flow
Script/tool → Sally API → Prisma/Postgres

### Hosted MCP flow
MCP client → `/mcp` on Sally API → normal Sally API logic → Prisma/Postgres

### Local stdio MCP flow
MCP client → `sally-mcp` stdio process → Sally API → Prisma/Postgres

## Current constraints / known rough edges

- response envelopes are not fully uniform yet
- some docs still point to other docs rather than being generated from code
- hosted MCP and stdio MCP tool coverage overlap but are not perfectly identical
- some aggregated API routes would benefit from generated schemas
- upload handling is currently JSON/base64 based rather than multipart/signed upload flows

## Architectural north star

Sally should evolve into a system where:
- humans can work quickly in the UI
- agents can operate safely through API or MCP
- docs can be generated or verified from the implementation
- self-hosting stays realistic
- permissions stay comprehensible

## Source of truth

For exact implementation details, use:
- `apps/api/src/index.ts`
- `apps/mcp/src/index.ts`
- `packages/db/prisma/schema.prisma`
- [`docs/api.md`](./api.md)
