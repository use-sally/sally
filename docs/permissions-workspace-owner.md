# Permissions: workspace owner visibility contract

Status: **audited and documented** — no code changes needed, behavior already correct.

## Rule

**A workspace owner has full visibility and access to all projects, tasks, and timesheets in their workspace, without requiring explicit project membership.**

This is a first-class product contract, not an implementation detail.

## How it works

The API enforces this through explicit workspace owner checks in every permission function:

| Function | Line | What it does for workspace owners |
|----------|------|-----------------------------------|
| `requireProjectRole` | ~248 | Returns `true` immediately — no project membership required |
| `getVisibleProjectIds` | ~271 | Returns `null` (all projects visible) |
| `getTaskAccessScope` | ~315 | Returns `{ restricted: false }` — sees all tasks |
| `taskVisibilityWhere` | ~324 | Returns `{}` (no filter) when scope is unrestricted |
| `canAccessTaskAssignee` | ~330 | Returns `true` when scope is unrestricted |
| `resolveTimesheetScope` | ~705 | Returns `{ elevated: true }` — sees all timesheets |

## What workspace owners can do

- See all projects in the workspace (including those they are not a member of)
- See all tasks in every project (regardless of assignee)
- Create, update, archive, delete projects and tasks
- Manage project memberships
- See all timesheet entries across the workspace
- Use all MCP tools with full visibility

## What workspace owners cannot do

- Access projects in other workspaces (workspace isolation is absolute)
- Bypass platform-level restrictions (superadmin is a separate role)

## MCP behavior

Both hosted and stdio MCP inherit the same permission model. An MCP key tied to a workspace owner account gets the same full visibility as the UI. If the MCP key is restricted to a specific workspace, visibility is scoped to that workspace only.

## Implications for new features

When adding new features:
- Always check workspace owner role early in permission logic
- Workspace owners should never need project membership to access data
- Test that new endpoints work for workspace owners without project-level roles
- This contract applies equally to API, UI, and MCP

## Roles overview

| Role | Scope | Visibility |
|------|-------|------------|
| `SUPERADMIN` | Platform | All workspaces (configured via env) |
| `OWNER` | Workspace | All projects/tasks/timesheets in workspace |
| `MEMBER` | Workspace | Only projects they are members of |
| `VIEWER` | Workspace | Read-only access to assigned projects |
| `OWNER` | Project | Full access to one project |
| `MEMBER` | Project | Standard access to one project |
