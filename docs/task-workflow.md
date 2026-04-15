# Task workflow and ordering

This document describes the current Sally task workflow model after the task ordering and blocked-status update line.

## Core model

Task identity and task order are now separate concerns.

- `Task.number`
  - stable human-facing reference number inside a project
  - should not change during normal reordering
  - used when humans refer to a task by number

- `Task.position`
  - mutable canonical project-wide order
  - updated by reorder actions
  - used to determine the current sequence of tasks across the project

This distinction matters because Sally now supports reorder operations that should change execution order without changing the stable task reference.

## Status model

`TaskStatusType` now includes:
- `BACKLOG`
- `TODO`
- `IN_PROGRESS`
- `BLOCKED`
- `REVIEW`
- `DONE`

In practice, default Sally project workflows now use:
1. Backlog
2. In Progress
3. Blocked
4. Review
5. Done

`TODO` remains available as a valid semantic status type, but it is not part of the current default seeded workflow.

## Default project/task initialization

New default project statuses are created with ordered positions.

Current default order:
- Backlog → `position=0`
- In Progress → `position=1`
- Blocked → `position=2`
- Review → `position=3`
- Done → `position=4`

Seed data was updated to match this model.

## Reorder behaviors

Sally now has three different reorder paths.

### 1. Project status reorder

Purpose:
- reorder the workflow columns/statuses for a project

Behavior:
- the first status is pinned
- only the remaining statuses may be reordered

Interface:
- API: `POST /projects/:projectId/statuses/reorder`
- MCP: `project.statuses.reorder`

## 2. Board task reorder

Purpose:
- move tasks within a board column or into another status column

Behavior:
- updates task `statusId`
- updates per-status task ordering through the provided ordered task list
- persists the resulting `position` values

Interface:
- API: `POST /tasks/reorder`
- MCP: `task.reorder`

## 3. Project-wide task reorder

Purpose:
- reorder the canonical project task sequence without changing task status

Behavior:
- updates only `Task.position`
- preserves current status placement
- powers drag-and-drop ordering in the project task list view

Interface:
- API: `POST /projects/:projectId/tasks/reorder`
- MCP: `project.tasks.reorder`

## UI implications

The current UI uses this model in several places.

### Project task list
- supports drag-and-drop reorder
- persists the full ordered task id list
- uses canonical `position` ordering

### Board view
- reads statuses ordered by status `position`
- reads tasks ordered by task `position`
- supports move/reorder behavior through the task reorder endpoint

### Status settings
- supports drag-and-drop reorder for statuses
- keeps the first status pinned
- allows creation of statuses including `Blocked`

## API / response shape

Project, task, board, and recent-task responses now expose `position` so clients can render the canonical order consistently.

Examples include:
- project task list items
- board cards
- project recent tasks
- task detail payloads
- status option payloads

## Migration impact

This release line includes:
- schema updates for the `BLOCKED` status model
- migration `20260415162500_add_blocked_status`
- seed/default workflow updates

For installer-managed deployments, `create-sally update` is expected to apply these migrations automatically.
