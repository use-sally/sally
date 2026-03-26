# Sally documentation

Sally is an API-first project management system for humans, agents, and internal operations.

This documentation set is intended to be useful in two ways:
- **for humans** who want to install, operate, and use Sally day to day
- **for LLMs and agents** that need implementation-backed references, concrete examples, and predictable workflows

If a page here disagrees with the actual implementation, trust the code in:
- `apps/api/src/index.ts`
- `apps/mcp/src/index.ts`
- `packages/db/prisma/schema.prisma`

## Start here

### If you want to install Sally
- [Ubuntu / Debian install tutorial](./ubuntu-debian-install.md)
- [Install + release notes](./install-release.md)

### If you want to understand the product quickly
- [Product + workflow guide](./product-guide.md)
- [Architecture](./ARCHITECTURE.md)

### If you want to integrate with the API
- [API reference](./api.md)
- [Auth + workspace selection pointer](./auth.md)

### If you want to use MCP
- [Hosted MCP + stdio MCP guide](./mcp.md)

### If you want practical walkthroughs
- [Tutorials + examples](./tutorials.md)

### If you need operations / recovery
- [Backup + recovery](./recovery.md)

---

## Current product surface

Sally currently covers:
- account login and session auth
- workspaces and memberships
- invites and password reset flows
- projects with default or custom statuses
- project memberships
- tasks with priorities, descriptions, due dates, labels, todos, comments, and inline images
- clients linked to projects
- notifications for assignment and mentions
- timesheets and reporting
- hosted MCP via `/mcp`
- local stdio MCP via `sally-mcp`

## Documentation style notes

This repo intentionally contains both:
- **high-level explanation docs** for humans
- **implementation-backed reference docs** for precise integration work

When in doubt:
1. use the high-level guides to understand the workflow
2. use `docs/api.md` for exact request/response and permission behavior
3. verify unusual edge cases in the source

## Recommended reading order

For a new operator:
1. `README.md`
2. `docs/product-guide.md`
3. `docs/ubuntu-debian-install.md`
4. `docs/mcp.md`
5. `docs/recovery.md`

For an engineer or agent:
1. `README.md`
2. `docs/api.md`
3. `docs/mcp.md`
4. `docs/tutorials.md`
5. `docs/ARCHITECTURE.md`
