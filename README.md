# Sally

**API-first project management for humans and agents.**

Sally is the project management system we built because existing tools felt bloated, soft, and hostile to real automation.

We wanted one place where:
- humans can collaborate cleanly
- agents and automations can interact through a real API
- teams can self-host and adapt the system to the way they actually work

Sally is designed for teams that already live in terminals, APIs, and operational reality.

---

## Why Sally exists

Most PM tools optimize for SaaS packaging, feature sprawl, and workflow decoration.

Sally is the opposite:
- **API-first from day one**
- **low-noise UI for real operators**
- **self-hostable**
- **human + agent collaboration in one system**
- **public source with fair-code protections**

We built it for ourselves first.
Now we are turning it into something other teams can use too.

---

## What Sally already covers

- workspaces, roles, and memberships
- projects, tasks, comments, and activity
- custom statuses and boards
- clients and timesheets
- account-level API keys
- web app + API in one TypeScript-first system

---

## Quick install

The easiest way to install Sally is with the npm installer:

```bash
npx --yes create-sally@latest
```

For a copy-paste Ubuntu / Debian walkthrough, see:
- [`docs/ubuntu-debian-install.md`](./docs/ubuntu-debian-install.md)

The installer guides you through setup and supports two modes:

### `managed-simple`
For the easiest path.

Sally sets up:
- Docker
- Postgres
- HTTPS via Caddy
- web + API containers

Best when you want a clean single-server install quickly.

### `existing-infra`
For teams that already have infrastructure.

Use this when you want Sally to fit into:
- your own reverse proxy
- your own TLS setup
- your own hosting layout
- a more customized deployment flow

---

## What the installer is meant to feel like

We want Sally setup to be:
- fast
- obvious
- low-noise
- safe for non-technical operators
- good enough for engineers who want control

That means:
- sensible defaults
- immediate DNS checks where needed
- minimal unnecessary questions
- clean success output
- no giant walls of technical noise unless something breaks

---

## Typical managed-simple flow

1. Run the installer
2. Docker is checked and, on Linux, installed automatically if missing
3. Pick a domain
4. Confirm the domain resolves to the server
5. Choose the first workspace name
6. Enter superadmin + email settings
7. Sally writes the instance files
8. Sally pulls fresh images and boots the stack
9. Sally also installs and scaffolds `sally-mcp`
10. You get a final welcome screen with:
   - URL
   - USER
   - PASSWORD

---

## Repo structure

- `apps/web` — Sally frontend
- `apps/api` — Sally API
- `apps/create-sally` — npm installer package
- `packages/types` — shared types/contracts

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

### Build the installer

```bash
pnpm --filter create-sally build
```

---

## Deployment model

Sally currently ships as:
- a web image
- an API image
- a simple installer that writes deployment files and runs the setup flow

Published images:
- `ghcr.io/use-sally/sally-web`
- `ghcr.io/use-sally/sally-api`

Published installer:
- `create-sally`

Published MCP package:
- `sally-mcp`

---

## Product direction

We want Sally to become the clean control surface for teams that work with:
- humans
- LLMs
- agents
- scripts
- internal operations
- API-driven workflows

Not another bloated productivity layer.
A real operational system.

---

## Licensing

Sally is **source-available**, not open source in the OSI sense.

This repository uses the **Business Source License 1.1 (BSL 1.1)** with a custom **Additional Use Grant**.

### In short

You can:
- use Sally personally
- self-host Sally
- use Sally inside your own business
- adapt Sally for your own internal needs

You cannot, without separate permission from **Kraft Fabrik Media Ltd.**:
- run Sally as a SaaS or managed service for third parties
- white-label or resell Sally
- publish a competing production-ready version under another brand
- remove Sally attribution or support/development messages from the community version

See [`LICENSE`](./LICENSE) for the binding terms and [`LICENSING.md`](./LICENSING.md) for the plain-English summary.

---

## Links

- Website: https://usesally.com
- Docs: https://usesally.com/docs
- GitHub: https://github.com/use-sally/sally
- Installer package: https://www.npmjs.com/package/create-sally
