# Schema spec: canonical lifecycle metadata contract for projects and tasks

Status: **implemented** (commit `2ac6d6b`)

## Data model

Prisma already provides lifecycle fields on both models:

```prisma
model Project {
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Task {
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

No additional columns are needed. `@updatedAt` is managed automatically by Prisma on every write.

## Naming contract

All public surfaces use **camelCase** ISO 8601 strings:

| Field | Type | Meaning |
|-------|------|---------|
| `createdAt` | `string` (ISO 8601) | When the record was first created |
| `updatedAt` | `string` (ISO 8601) | When the record was last modified |

No aliases (`date_created`, `lastEditedAt`, `modified_at`, etc.) are used. One name, one meaning, everywhere.

## API exposure

### Projects
- `GET /projects` (list): returns `createdAt`, `updatedAt`
- `GET /projects/:projectId` (detail): returns `createdAt`, `updatedAt`

### Tasks
- `GET /projects/:projectId/tasks` (list): returns `createdAt`, `updatedAt`
- `GET /tasks/:taskId` (detail): returns `createdAt`, `updatedAt`
- `GET /board` (cards): returns `createdAt`, `updatedAt`
- `GET /projects/:projectId` → `recentTasks[]`: returns `createdAt`, `updatedAt`

## Shared types

All relevant types in `packages/types/src/index.ts` include both fields:
- `Project`
- `ProjectDetail`
- `ProjectTaskListItem`
- `BoardCard`
- `TaskDetail`
- `ProjectDetail.recentTasks[]`

## MCP exposure

MCP proxies API responses — all task and project reads include `createdAt` and `updatedAt` automatically.

## UI exposure

- Task detail page sidebar: shows "Created" and "Last updated" as localized date strings
- Not shown in task list or board views to avoid clutter

## Design decisions

- **No `archivedAt` duplication**: `archivedAt` is a separate nullable field with different semantics (soft delete). It is not lifecycle metadata in the same sense.
- **No `createdBy` / `updatedBy`**: actor tracking is handled by `ActivityLog`, not by fields on the entity. This keeps the core models simple.
- **`@updatedAt` auto-management**: Prisma handles this — no manual updates needed. Any `prisma.task.update()` or `prisma.project.update()` automatically bumps `updatedAt`.
