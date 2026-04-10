# Schema spec: task numbering model and backfill strategy

Status: **implemented** (commit `6746f85`)

## Data model

### Project
```prisma
model Project {
  taskCounter Int @default(0)   // last assigned task number
}
```

### Task
```prisma
model Task {
  number Int?                   // project-local sequential number

  @@unique([projectId, number]) // uniqueness per project
}
```

## Numbering rules

- **Project-scoped**: each project has an independent counter starting at 1
- **Monotonic**: numbers always increase, never decrease
- **Immutable**: once assigned, a task's number never changes — not on archive, delete, move, or status change
- **No gaps filled**: if task #5 is deleted, the next task is still #6, not #5
- **Nullable**: the field is `Int?` to support the migration period; after backfill all tasks have a number

## Assignment flow

On `POST /tasks` (inside a transaction):
1. `UPDATE Project SET taskCounter = taskCounter + 1 WHERE id = :projectId` (atomic increment)
2. `INSERT Task ... number = project.taskCounter`

This guarantees no race conditions even under concurrent creation.

## Backfill strategy

Script: `packages/db/scripts/backfill-task-numbers.ts`

For each project:
1. Query all tasks ordered by `createdAt ASC` (tie-breaker: `id ASC`)
2. Assign numbers 1..N to unnumbered tasks
3. Set `Project.taskCounter` to the highest assigned number

The backfill is idempotent — already-numbered tasks are skipped.

## API exposure

`number` is returned in:
- `GET /projects/:projectId/tasks` (task list)
- `GET /tasks/:taskId` (task detail)
- `GET /board` (board cards)
- `GET /projects/:projectId` → `recentTasks[]`

## MCP exposure

- `task.list`, `task.get`, `board.get` all include `number`
- `task.getByNumber` allows lookup by `projectId` + `number` instead of CUID

## Decisions not taken

- **No composite display key** (e.g. `SLY-42`): deferred. Raw number is sufficient for agents and UI. A computed `taskKey` field could be added later as `projectSlug + '-' + number` without schema changes.
- **No index on `[projectId, number]`**: the `@@unique` constraint already creates an index.
