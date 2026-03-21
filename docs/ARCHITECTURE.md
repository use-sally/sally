# Architecture

## Direction
Build a new TypeScript-first PM product instead of extending Leantime/PHP.

## Monorepo
- apps/web: Next.js app
- apps/api: Fastify API
- packages/db: Prisma schema and database client
- packages/ui: shared UI components
- packages/types: shared types

## Principles
- typed end-to-end
- JSON-first API
- internal-tool first
- low-noise UI
- agent-friendly codebase

## MVP
- auth
- workspace
- projects
- tasks
- statuses
- board
- task detail
- comments
