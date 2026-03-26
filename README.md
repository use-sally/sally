# sally

Modern internal PM product for sally_.

## Stack
- Next.js
- Fastify
- Postgres
- Prisma
- Tailwind
- shadcn/ui
- pnpm workspaces

## Apps
- `apps/web` — frontend
- `apps/api` — API
- `packages/db` — Prisma schema/client
- `packages/ui` — shared UI
- `packages/types` — shared types/contracts

## Initial product scope
- auth
- workspaces
- projects
- tasks
- statuses
- kanban board
- comments
- basic filters

## Auth/workspace notes
See `docs/auth.md` for the current API token + workspace header setup.

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
