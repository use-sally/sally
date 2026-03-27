# Sally

**API-first project management for humans and agents.**

Sally is a self-hostable PM system built for teams that care about real operational workflows, low-noise UI, and first-class automation.

We built it because too many project management tools feel bloated, soft, and hostile to APIs, agents, and actual execution.

With Sally, the goal is simple:
- give humans a clean control surface
- give scripts and agents a real API
- keep permissions and state grounded in one system

---

## Why Sally exists

Most PM tools optimize for:
- SaaS packaging
- workflow decoration
- feature sprawl
- polished demos over operational clarity

Sally goes the other direction:
- **API-first from day one**
- **self-hostable**
- **human + agent collaboration**
- **TypeScript-first monorepo**
- **low-noise operator UI**
- **hosted MCP built into the product**

We built it for ourselves first.
Now we are turning it into something other teams can actually use.

---

## What Sally already covers

Current product surface:
- workspaces, memberships, invites, and roles
- projects, project members, statuses, and activity
- tasks, labels, comments, due dates, and checklists
- clients and project/client linking
- timesheets and reporting
- notifications and notification preferences
- personal API keys and hosted MCP keys
- hosted MCP endpoint (`/mcp`)
- local stdio MCP package (`sally-mcp`) kept as a parked advanced/legacy path
- web app + API in one TypeScript-first system

---

## Start here

### Install Sally
The easiest path is the installer:

```bash
npx --yes create-sally@latest
```

Detailed guides:
- [`docs/index.md`](./docs/index.md)
- [`docs/ubuntu-debian-install.md`](./docs/ubuntu-debian-install.md)
- [`docs/install-release.md`](./docs/install-release.md)

### Understand the product
- [`docs/product-guide.md`](./docs/product-guide.md)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

### Integrate with the API
- [`docs/api.md`](./docs/api.md)
- [`docs/tutorials.md`](./docs/tutorials.md)

### Use MCP
- [`docs/mcp.md`](./docs/mcp.md)
- [`apps/mcp/README.md`](./apps/mcp/README.md) — only if you explicitly want the parked local stdio path

---

## Installer modes

### `managed-simple`
Best when you want the fastest clean install.

Sally sets up:
- Docker
- Postgres
- HTTPS via Caddy
- web + API containers

Use this when you want a single-server install with sensible defaults.

### `existing-infra`
Best when you already have hosting and edge decisions.

Use this when Sally needs to fit into:
- your existing reverse proxy
- your TLS setup
- your deployment conventions
- a more customized infrastructure layout

---

## Hosted MCP at a glance

Hosted MCP is now a primary product path.

Typical flow:
1. create a hosted MCP key inside Sally
2. point your MCP client at `https://your-domain.com/mcp`
3. authenticate with `Authorization: Bearer sallymcp_...`
4. initialize the MCP session
5. list and call tools

Hosted MCP keys:
- inherit real Sally permissions
- can optionally be restricted to a workspace
- are the default and recommended MCP path
- are a better default than telling users to run extra local wrappers

For details and examples:
- [`docs/mcp.md`](./docs/mcp.md)

---

## Typical use cases

Sally works well for:
- agency and client operations
- internal delivery/project execution
- support and implementation workflows
- automation-heavy teams
- agent-assisted planning and updates
- self-hosted internal tooling

---

## Repo structure

- `apps/web` — human-facing Next.js app
- `apps/api` — Fastify API + hosted MCP endpoint
- `apps/create-sally` — installer/bootstrap package
- `apps/mcp` — parked local stdio MCP package for advanced/legacy setups
- `packages/db` — Prisma schema + DB client
- `packages/ui` — shared UI
- `packages/types` — shared types
- `docs` — human + implementation-backed documentation

---

## Development

### Requirements
- Node.js
- pnpm
- Docker (for deployment testing)

### Install dependencies

```bash
pnpm install
```

### Run the web app

```bash
pnpm --filter web dev
```

### Run the API

```bash
pnpm --filter api dev
```

### Build everything

```bash
pnpm build
```

### Build individual packages

```bash
pnpm --filter create-sally build
pnpm --filter mcp build
pnpm --filter api build
pnpm --filter web build
```

---

## Documentation philosophy

This repo intentionally has two kinds of docs:

### 1. Human-first guides
These explain workflows, installation, and operations clearly.

### 2. Implementation-backed references
These track the current code so engineers and LLMs can integrate accurately.

If there is ever a conflict:
1. trust `docs/api.md`
2. trust the source code over aspirational copy

---

## Deployment model

Sally currently ships as:
- a web image
- an API image
- an installer package
- an optional parked local MCP package

Published images:
- `ghcr.io/use-sally/sally-web`
- `ghcr.io/use-sally/sally-api`

Published packages:
- `create-sally`
- `sally-mcp`

---

## Product direction

We want Sally to become the clean operational core for teams that work with:
- humans
- APIs
- scripts
- agents
- internal execution
- project and delivery workflows

Not another ornamental productivity layer.
A real system.

---

## Licensing

Sally is **source-available**, not open source in the OSI sense.

This repository uses the **Business Source License 1.1 (BSL 1.1)** with a custom **Additional Use Grant**.

### In short

You can:
- use Sally personally
- self-host Sally
- use Sally inside your own business
- adapt Sally for internal needs

You cannot, without separate permission from **Kraft Fabrik Media Ltd.**:
- run Sally as a SaaS or managed service for third parties
- white-label or resell Sally
- publish a competing production-ready version under another brand
- remove Sally attribution or community-version support/development messages

See [`LICENSE`](./LICENSE) for binding terms and [`LICENSING.md`](./LICENSING.md) for the plain-English summary.

---

## Links

- Website: https://usesally.com
- Docs: https://usesally.com/docs
- GitHub: https://github.com/use-sally/sally
- Installer package: https://www.npmjs.com/package/create-sally
