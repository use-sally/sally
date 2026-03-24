# automatethis-pm

Modern internal PM product for AutomateThis.

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
