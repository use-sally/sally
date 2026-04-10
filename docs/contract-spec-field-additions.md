# Contract spec: API and MCP field additions for numbering and dependencies

Status: **implemented**

This document summarizes all fields added to API/MCP contracts across tasks #6-12.

## New fields by endpoint

### GET /projects (project list)

| Field | Type | Added in |
|-------|------|----------|
| `createdAt` | string (ISO 8601) | Task #7 |
| `updatedAt` | string (ISO 8601) | Task #7 |

### GET /projects/:projectId (project detail)

| Field | Type | Added in |
|-------|------|----------|
| `createdAt` | string (ISO 8601) | Task #7 |
| `updatedAt` | string (ISO 8601) | Task #7 |
| `dependencies` | `{ projectId, name }[]` | Task #9 |
| `dependedOnBy` | `{ projectId, name }[]` | Task #9 |

### GET /projects/:projectId/tasks (task list)

| Field | Type | Added in |
|-------|------|----------|
| `number` | number \| null | Task #6 |
| `createdAt` | string (ISO 8601) | Task #7 |
| `updatedAt` | string (ISO 8601) | Task #7 |

### GET /tasks/:taskId (task detail)

| Field | Type | Added in |
|-------|------|----------|
| `number` | number \| null | Task #6 |
| `createdAt` | string (ISO 8601) | Task #7 |
| `updatedAt` | string (ISO 8601) | Task #7 |
| `dependencies` | `{ taskId, number, title }[]` | Task #8 |
| `dependedOnBy` | `{ taskId, number, title }[]` | Task #8 |

### GET /board (board cards)

| Field | Type | Added in |
|-------|------|----------|
| `number` | number \| null | Task #6 |
| `createdAt` | string (ISO 8601) | Task #7 |
| `updatedAt` | string (ISO 8601) | Task #7 |

## New API endpoints

| Method | Path | Purpose | Added in |
|--------|------|---------|----------|
| POST | `/tasks/:taskId/dependencies` | Add task dependency | Task #8 |
| DELETE | `/tasks/:taskId/dependencies/:dependsOnId` | Remove task dependency | Task #8 |
| POST | `/projects/:projectId/dependencies` | Add project dependency | Task #9 |
| DELETE | `/projects/:projectId/dependencies/:dependsOnId` | Remove project dependency | Task #9 |

## New MCP tools

| Tool | Description | Added in |
|------|-------------|----------|
| `task.dependencies.add` | Add task dependency | Task #8/#12 |
| `task.dependencies.remove` | Remove task dependency | Task #8/#12 |
| `task.getByNumber` | Lookup task by project + number | Task #12 |
| `project.dependencies.add` | Add project dependency | Task #9/#12 |
| `project.dependencies.remove` | Remove project dependency | Task #9/#12 |

## Shared types updated

All types in `packages/types/src/index.ts`:
- `Project` — added `createdAt`, `updatedAt`
- `ProjectDetail` — added `createdAt`, `updatedAt`, `dependencies`, `dependedOnBy`
- `ProjectTaskListItem` — added `number`, `createdAt`, `updatedAt`
- `BoardCard` — added `number`, `createdAt`, `updatedAt`
- `TaskDetail` — added `number`, `createdAt`, `updatedAt`, `dependencies`, `dependedOnBy`
- `ProjectDetail.recentTasks[]` — added `number`, `createdAt`, `updatedAt`
- New types: `TaskDependencyRef`, `ProjectDependencyRef`
