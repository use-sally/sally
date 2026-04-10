# Sally API

Canonical repo docs for the current API implementation in `apps/api/src/index.ts`.

This document is based on the actual Fastify + Prisma code in the repo, not an aspirational spec. If this doc disagrees with older notes elsewhere, trust this file and the implementation.

## Base URL

- Local API dev server: `http://127.0.0.1:4000`
- Deployed installs usually expose the API under `/api` on the main domain, for example:
  - `https://your-sally-domain.com/api/health`

Most routes below are shown without the `/api` prefix.

## Response style

The API is not yet fully uniform.

- Some endpoints return envelope objects like `{ ok: true, ... }`
- Some list/read endpoints return raw arrays or raw objects
- Error responses usually look like `{ ok: false, error: 'Message' }`

This is one of the strongest candidates for later OpenAPI generation + contract cleanup.

---

## Auth model

Sally currently supports four auth paths:

### 1. Session auth

Primary path for the web app.

Accepted headers:
- `Authorization: Bearer <sessionToken>`
- `X-Session-Token: <sessionToken>`

Session records live in `AccountSession`.

Session lifecycle:
- created by `POST /auth/login`
- revoked by `POST /auth/logout`
- expires after `SESSION_TTL_DAYS` days, default `30`

### 2. Personal API keys

For scripts, agents, and MCP stdio clients.

Accepted headers:
- `Authorization: Bearer <apiKey>`
- `X-Api-Key: <apiKey>`

Notes:
- only the token hash is stored (`AccountApiKey.tokenHash`)
- token prefix is stored for display
- `lastUsedAt` is updated on successful use
- key tokens are minted with `atpm_...`

### 3. Hosted MCP keys

For the hosted `/mcp` endpoint.

Accepted header:
- `Authorization: Bearer <mcpKey>`

Notes:
- stored in `AccountMcpKey`
- token prefix is stored for display
- `lastUsedAt` is updated on successful use
- key tokens are minted with `sallymcp_...`
- may optionally be restricted to a single workspace via `workspaceId`

### 4. Global API token

Bootstrap/testing bypass.

Environment:
- `API_TOKEN` or `API_KEY`

Behavior:
- if present and the supplied bearer token exactly matches it, the request is accepted
- this path bypasses normal account/session/key lookup
- if `API_TOKEN` is configured and no valid token is provided, protected routes return `401`

## Public / unauthenticated routes

These are excluded from the main auth hook:

- `GET /health`
- `GET /uploads/task-images/:taskId/:fileName`
- `GET /uploads/profile-images/:accountId/:fileName`
- `POST /auth/login`
- `POST /auth/accept-invite`
- `POST /auth/request-password-reset`
- `POST /auth/reset-password`
- `/mcp` has its own MCP-specific auth handling

## Login / session endpoints

### `POST /auth/login`
Request:
```json
{ "email": "alex@example.com", "password": "StrongPassw0rd!" }
```

Response:
```json
{
  "ok": true,
  "sessionToken": "...",
  "expiresAt": "2026-03-26T12:00:00.000Z",
  "account": {
    "id": "...",
    "name": "Alex",
    "email": "alex@example.com",
    "avatarUrl": null,
    "platformRole": "NONE"
  },
  "memberships": [
    {
      "id": "...",
      "workspaceId": "...",
      "workspaceName": "sally_",
      "role": "OWNER"
    }
  ]
}
```

Validation:
- `email` required
- `password` required
- invalid credentials => `401`

Special case:
- if the email matches configured `SUPERADMIN_EMAIL`, login can validate against `SUPERADMIN_PASSWORD_HASH` from env instead of the DB password hash

### `POST /auth/logout`
Requires a live session token.

Response:
```json
{ "ok": true }
```

### `GET /auth/me`
Returns the authenticated account plus workspace memberships.

---

## Workspace selection and headers

For most non-auth routes, Sally resolves a workspace before the handler runs.

Supported selectors:
- `X-Workspace-Id`
- `X-Workspace-Slug`
- query params `workspaceId`, `workspace_id`, `workspaceSlug`, `workspace_slug`

Resolution rules:
- if the caller is using an MCP key restricted to a workspace, that workspace is forced
- if the caller is an authenticated account:
  - memberships are loaded
  - if one membership exists, it is auto-selected
  - if multiple memberships exist, a workspace selector is required
  - selecting a workspace the caller does not belong to returns `403`
- if the caller is unauthenticated but auth is globally disabled:
  - workspace is resolved by id/slug
  - if exactly one workspace exists, it auto-selects
  - otherwise a selector is required

Common failure modes:
- `400 { ok:false, error:'workspace selector required' }`
- `403 { ok:false, error:'Workspace access denied' }`
- `404 { ok:false, error:'Workspace not found' }`
- `403 { ok:false, error:'Workspace access denied by MCP key restriction' }`

### Practical curl example

```bash
curl -H "Authorization: Bearer $SALLY_API_KEY" \
  -H "X-Workspace-Slug: sally" \
  https://your-sally-domain.com/api/projects
```

---

## Permission model

### Platform role

`Account.platformRole`:
- `NONE`
- `SUPERADMIN`

`SUPERADMIN` bypasses most normal workspace/project permission checks.

### Workspace role

Prisma enum:
- `OWNER`
- `MEMBER`
- `VIEWER`

In practice, these routes mostly treat roles like this:
- `OWNER`: full workspace/project management
- `MEMBER`: normal edit access
- `VIEWER`: read-only access

### Project role

- `OWNER`
- `MEMBER`
- `VIEWER`

Notable behavior:
- workspace owners are effectively project owners
- configured superadmin is effectively project owner
- project `MEMBER` is more restricted than project `OWNER`/`VIEWER` for task visibility: they only see tasks assigned to one of their own assignee-name variants (account name or email)

### Timesheet visibility

Timesheets have a separate scope rule:
- `SUPERADMIN`, workspace `OWNER`, and project `OWNER` get elevated visibility
- everyone else is scoped to a single `User` record for that account in the workspace

This means task/project read access and timesheet visibility are related but not identical.

---

## Core domain shapes

These are the useful shapes exposed by the handlers, simplified from Prisma.

### Account
```json
{
  "id": "...",
  "name": "Alex",
  "email": "alex@example.com",
  "avatarUrl": null,
  "platformRole": "NONE"
}
```

### Workspace membership
```json
{
  "id": "...",
  "workspaceId": "...",
  "workspaceName": "sally_",
  "role": "OWNER"
}
```

### Project list item
```json
{
  "id": "...",
  "name": "Website relaunch",
  "client": { "id": "...", "name": "Acme" },
  "lead": "alex@example.com",
  "tasks": 12,
  "status": "Review",
  "createdAt": "2026-04-07T13:00:00.000Z",
  "updatedAt": "2026-04-10T12:00:00.000Z",
  "archivedAt": null
}
```

### Project detail (additional fields beyond list item)
```json
{
  "description": "...",
  "taskCount": 12,
  "openTasks": 8,
  "reviewTasks": 2,
  "createdAt": "2026-04-07T13:00:00.000Z",
  "updatedAt": "2026-04-10T12:00:00.000Z",
  "dependencies": [{ "projectId": "...", "name": "Infrastructure" }],
  "dependedOnBy": [{ "projectId": "...", "name": "Mobile app" }],
  "statuses": [],
  "labels": [],
  "recentTasks": []
}
```

### Task list item
```json
{
  "id": "...",
  "number": 5,
  "title": "Ship onboarding flow",
  "assignee": "alex@example.com",
  "assigneeAvatarUrl": null,
  "priority": "P2",
  "status": "In Progress",
  "statusId": "...",
  "statusColor": "#172554",
  "dueDate": null,
  "createdAt": "2026-04-07T13:06:00.000Z",
  "updatedAt": "2026-04-10T12:00:00.000Z",
  "labels": ["frontend", "priority"],
  "todoProgress": "1/3",
  "archivedAt": null
}
```

### Task detail (additional fields beyond list item)
```json
{
  "number": 5,
  "description": "...",
  "createdAt": "2026-04-07T13:06:00.000Z",
  "updatedAt": "2026-04-10T12:00:00.000Z",
  "dependencies": [{ "taskId": "...", "number": 3, "title": "Set up auth" }],
  "dependedOnBy": [{ "taskId": "...", "number": 8, "title": "Write tests" }],
  "todos": [],
  "comments": [],
  "project": { "id": "...", "name": "Website relaunch", "client": null }
}
```

### Board card
```json
{
  "id": "...",
  "number": 5,
  "title": "Ship onboarding flow",
  "meta": "alex@example.com · P2",
  "description": "...",
  "assignee": "alex@example.com",
  "priority": "P2",
  "status": "In Progress",
  "statusId": "...",
  "dueDate": null,
  "createdAt": "2026-04-07T13:06:00.000Z",
  "updatedAt": "2026-04-10T12:00:00.000Z",
  "labels": ["frontend"],
  "todoProgress": "1/3"
}
```

### Timesheet entry
```json
{
  "id": "...",
  "userId": "...",
  "userName": "Alex",
  "projectId": "...",
  "taskId": "...",
  "taskTitle": "Ship onboarding flow",
  "date": "2026-03-26T00:00:00.000Z",
  "minutes": 90,
  "description": "QA + polish",
  "billable": true,
  "validated": false,
  "createdAt": "2026-03-26T12:00:00.000Z"
}
```

---

## Route groups

## Health

### `GET /health`
Response:
```json
{
  "ok": true,
  "service": "api",
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

---

## Profile and account auth

### `GET /auth/profile`
Returns:
```json
{
  "ok": true,
  "profile": {
    "id": "...",
    "name": "Alex",
    "email": "alex@example.com",
    "avatarUrl": null,
    "pendingEmail": null,
    "platformRole": "NONE",
    "emailLocked": false
  }
}
```

### `PATCH /auth/profile`
Editable fields:
- `name`
- `email`
- `avatarUrl`

Behavior:
- changing `name` or `avatarUrl` updates immediately
- changing `email` creates an `EmailChangeToken` and sends a confirmation email
- configured superadmin email cannot be changed through the API

### `POST /auth/confirm-email-change`
Request:
```json
{ "token": "..." }
```

### `POST /auth/profile/image-upload`
Request:
```json
{
  "fileName": "avatar.png",
  "mimeType": "image/png",
  "base64": "..."
}
```
Response:
```json
{ "ok": true, "url": "/uploads/profile-images/<accountId>/<file>" }
```

### `POST /auth/invite`
Workspace owner only.

Request:
```json
{ "email": "newuser@example.com", "role": "MEMBER" }
```

Behavior:
- if the account already exists and is already a workspace member, returns `{ ok:true, existing:true }`
- if a live invite already exists, it re-sends email and returns `existing:true`
- otherwise creates an invite token and email attempt result

### `POST /auth/accept-invite`
Public route.

Request:
```json
{
  "token": "...",
  "name": "New User",
  "password": "StrongPassw0rd!"
}
```

Behavior:
- password must be at least 12 chars and include upper/lower/number/symbol
- creates account if needed
- fills password for pre-created accounts that were invited before activation
- creates workspace membership if missing
- returns a live session token and memberships

### `POST /auth/request-password-reset`
Public route.

Request:
```json
{ "email": "alex@example.com" }
```

Behavior:
- returns `{ ok:true }` even for unknown accounts
- for known accounts, may also return `expiresAt`
- configured superadmin can optionally disable password reset via env

### `POST /auth/reset-password`
Public route.

Request:
```json
{ "token": "...", "password": "StrongPassw0rd!" }
```

Response mirrors login and returns a new session.

---

## API keys and hosted MCP keys

### Personal API keys
- `GET /auth/api-keys`
- `POST /auth/api-keys`
- `DELETE /auth/api-keys/:apiKeyId`

Create request:
```json
{ "label": "Local agent" }
```

Create response:
```json
{
  "ok": true,
  "apiKeyId": "...",
  "token": "atpm_...",
  "key": "atpm_...",
  "prefix": "atpm_abc123"
}
```

Deletion behavior:
- first delete call revokes the key
- deleting an already revoked key permanently deletes the row

### Hosted MCP keys
- `GET /auth/mcp-keys`
- `POST /auth/mcp-keys`
- `DELETE /auth/mcp-keys/:mcpKeyId`

Create request:
```json
{ "label": "Claude hosted MCP", "workspaceId": "optional-workspace-id" }
```

Create response:
```json
{
  "ok": true,
  "mcpKeyId": "...",
  "token": "sallymcp_...",
  "key": "sallymcp_...",
  "prefix": "sallymcp_...",
  "workspaceId": "...",
  "workspaceSlug": "sally"
}
```

If `workspaceId` is supplied, the caller must already belong to that workspace.

---

## Workspaces and accounts

### `GET /workspaces`
Returns all workspaces visible to the caller.
- superadmin: all workspaces
- normal account: only member workspaces

### `POST /workspaces`
Superadmin only.

Request:
```json
{ "name": "Client Ops", "slug": "client-ops" }
```

Response:
```json
{ "ok": true, "workspaceId": "..." }
```

Behavior:
- slug is auto-generated if omitted
- slug collisions are auto-suffixed
- creator becomes workspace owner if there is an authenticated account

### `GET /accounts`
Superadmin only.

Returns all accounts with memberships.

### `POST /accounts`
Used to seed or pre-create accounts.

Behavior:
- if there are already accounts in the system, superadmin is required
- if no accounts exist yet, bootstrapping is allowed without superadmin
- existing email returns `{ ok:true, accountId, existing:true }`

### Workspace membership management
- `GET /workspaces/:workspaceId/members`
- `POST /workspaces/:workspaceId/members`
- `PATCH /workspaces/:workspaceId/members/:membershipId`
- `DELETE /workspaces/:workspaceId/members/:membershipId`

Important rules:
- owner-level control
- caller cannot change or remove their own role through these routes
- workspace must keep at least one owner
- role changes are constrained by helper checks

---

## Notifications

Supported notification event types:
- `comment.mentioned`
- `task.assigned`

### `GET /notifications`
Query params:
- `unreadOnly=true|false`
- `limit=1..100` default `20`

Returns a raw array, newest first:
```json
[
  {
    "id": "...",
    "type": "task.assigned",
    "title": "You were assigned a task",
    "body": "Ship onboarding flow",
    "readAt": null,
    "createdAt": "2026-03-26T12:00:00.000Z",
    "projectId": "...",
    "taskId": "...",
    "actor": {
      "id": "...",
      "name": "Alex",
      "email": "alex@example.com",
      "avatarUrl": null
    }
  }
]
```

### `POST /notifications/:notificationId/read`
Deletes the notification row if it belongs to the caller.

This is not a soft read flag update in the current implementation.

### `POST /notifications/read-all`
Deletes all notifications for the caller.

### `GET /notifications/preferences`
Returns both known event types with defaults filled in.

### `PUT /notifications/preferences`
Request:
```json
{
  "preferences": [
    {
      "eventType": "task.assigned",
      "inAppEnabled": true,
      "emailEnabled": true
    }
  ]
}
```

### `POST /notifications/process-deliveries`
Superadmin only.

Forces processing of pending `NotificationDelivery` rows.

---

## Clients

### `GET /clients`
Returns visible clients in the current workspace.

Shape:
```json
{ "id": "...", "name": "Acme", "notes": null, "projectCount": 2 }
```

### `POST /clients`
Workspace owner only.

Request:
```json
{ "name": "Acme", "notes": "VIP account" }
```

### `GET /clients/:clientId`
Returns client details plus visible projects.

### `PATCH /clients/:clientId`
Editable fields:
- `name`
- `notes`

### `DELETE /clients/:clientId`
Workspace owner only.

Refuses deletion if projects still reference the client.

---

## Projects

### `GET /projects/summary`
Returns:
```json
{
  "activeProjects": 4,
  "openTasks": 21,
  "cycleHealth": "Good"
}
```

`cycleHealth` becomes `Needs review` when review-column task count is greater than 3.

### `GET /projects`
Query params:
- `archived=true` to list archived projects

### `POST /projects`
Workspace `OWNER` or `MEMBER`.

Request:
```json
{
  "name": "Website relaunch",
  "description": "Q2 push",
  "clientId": "optional-client-id"
}
```

Behavior:
- auto-generates unique slug inside workspace
- auto-creates default statuses:
  - `Backlog`
  - `In Progress`
  - `Review`
  - `Done`
- auto-adds default project owners from:
  - current account
  - workspace owners
  - configured superadmin account

### `GET /projects/:projectId`
Returns project summary, statuses, labels, timesheet summary, recent timesheets, and recent visible tasks.

### `PATCH /projects/:projectId`
Project owner only.

Editable fields:
- `name`
- `description`
- `clientId` or `null`

Behavior:
- renaming re-slugs the project uniquely
- activity log records field-level changes

### `POST /projects/:projectId/archive`
Project owner only.

Request:
```json
{ "archived": true }
```

If `archived` is omitted, it archives by default.

### `DELETE /projects/:projectId`
Project owner only.

### Project dependencies
- `POST /projects/:projectId/dependencies` — add a project dependency (same workspace, cycles rejected)
- `DELETE /projects/:projectId/dependencies/:dependsOnId` — remove a project dependency

Request for add:
```json
{ "dependsOnId": "target-project-id" }
```

Dependencies are returned in `GET /projects/:projectId` as `dependencies[]` and `dependedOnBy[]`.

### Project members
- `GET /projects/:projectId/members`
- `POST /projects/:projectId/members`
- `PATCH /projects/:projectId/members/:membershipId`
- `DELETE /projects/:projectId/members/:membershipId`

Important behavior:
- project owners manage project memberships
- workspace owners act as project owners
- caller cannot change/remove their own project membership through these routes
- project must keep at least one owner
- API also exposes effective owners inherited from workspace owners and configured superadmin

### Project activity

`GET /projects/:projectId/activity`

Returns last 100 events, newest first.

Shape:
```json
{
  "id": "...",
  "type": "task.updated",
  "summary": "Updated task Ship onboarding flow.",
  "actorName": "Alex",
  "actorEmail": "alex@example.com",
  "actorApiKeyLabel": "Local agent",
  "details": ["status: Backlog → In Progress"],
  "createdAt": "2026-03-26T12:00:00.000Z"
}
```

### Status management
- `POST /projects/:projectId/statuses`
- `PATCH /projects/:projectId/statuses/:statusId`
- `POST /projects/:projectId/statuses/:statusId/delete`

Notes:
- currently workspace owner gated
- create appends a new TODO-type status with default dark color
- delete requires reassignment target when tasks still use that status
- default first status cannot be deleted

### Labels

`POST /projects/:projectId/labels`

Creates or reuses a project-scoped label.

---

## Board

### `GET /board`
Query params:
- `projectId` optional

Returns board data assembled by `getBoardData(...)` for the current workspace/project scope.

This route is important for the web UI but should later be captured in generated schema because the returned shape is aggregated and not obvious from route name alone.

---

## Tasks

### `GET /projects/:projectId/tasks`
Query params:
- `status`
- `assignee`
- `search`
- `label`
- `archived=true`

Returns task list items.

### `GET /tasks/:taskId`
Returns full task details:
- core task fields
- labels
- todos
- project summary
- comments
- timesheet summary
- recent timesheets

### `POST /tasks`
Workspace `OWNER` or `MEMBER`, plus project `OWNER` or `MEMBER`.

Request:
```json
{
  "projectId": "...",
  "title": "Ship onboarding flow",
  "assignee": "alex@example.com",
  "description": "",
  "priority": "P2",
  "status": "In Progress",
  "statusId": "optional-status-id",
  "dueDate": "2026-04-01",
  "labels": ["frontend", "priority"],
  "todos": [{ "text": "QA" }, { "text": "deploy" }]
}
```

Behavior:
- `projectId` and non-empty `title` required
- status resolution order: `statusId` -> `status` name -> first project status
- assignee defaults to current account email when omitted
- labels are normalized/deduplicated
- todos are normalized/deduplicated
- assignment may create notification and auto-ensure project membership for assignee name/email mapping logic

Response:
```json
{ "ok": true, "taskId": "..." }
```

### `PATCH /tasks/:taskId`
Editable fields:
- `title`
- `description`
- `assignee`
- `priority`
- `dueDate`
- `statusId`

Activity log stores field-level changes. Reassignment triggers assignment notification. Description edits can trigger cleanup of removed inline task-description images.

### `POST /tasks/:taskId/archive`
Owner only at workspace layer, project member+ at project layer.

Request:
```json
{ "archived": true }
```

### `DELETE /tasks/:taskId`
Workspace owner only.

### `POST /tasks/:taskId/dependencies`
Add a task dependency. Both tasks must be in the same project. Cycles are rejected.

Request:
```json
{ "dependsOnId": "target-task-id" }
```

Returns `{ "ok": true }` or error with reason (cycle, self-reference, duplicate, not found).

### `DELETE /tasks/:taskId/dependencies/:dependsOnId`
Remove a task dependency.

### `POST /tasks/:taskId/move`
Moves by target status name.

Request:
```json
{ "targetStatus": "Review" }
```

### `POST /tasks/reorder`
Moves/reorders tasks inside a status lane.

Request:
```json
{
  "taskId": "...",
  "targetStatusId": "...",
  "orderedTaskIds": ["...", "..."]
}
```

### Task labels
`PATCH /tasks/:taskId/labels`

Request:
```json
{ "labels": ["frontend", "priority"] }
```

This replaces the full label set for the task.

### Task todos
- `POST /tasks/:taskId/todos`
- `PATCH /tasks/:taskId/todos/:todoId`
- `POST /tasks/:taskId/todos/:todoId/delete`
- `POST /tasks/:taskId/todos/reorder`

Examples:
```json
{ "text": "QA pass" }
```

```json
{ "text": "QA pass", "done": true }
```

```json
{ "orderedTodoIds": ["todo1", "todo2"] }
```

Reorder requires an exact match of all existing todo ids.

### Comments
`POST /tasks/:taskId/comments`

Request:
```json
{
  "body": "Please check this @alex",
  "author": "optional override",
  "mentions": ["accountId1", "accountId2"]
}
```

Behavior:
- creates `Comment`
- validates mentioned account ids against workspace membership
- excludes self-mentions
- creates `CommentMention` rows
- creates `comment.mentioned` notifications

---

## Timesheets

### `GET /projects/:projectId/timesheets`
Optional query params:
- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

Returns:
```json
{
  "summary": {
    "totalMinutes": 180,
    "billableMinutes": 120,
    "nonBillableMinutes": 60,
    "validatedMinutes": 0
  },
  "entries": [ ... ]
}
```

### `GET /tasks/:taskId/timesheets`
Same summary + entry structure, scoped to one task.

### `GET /timesheets/users`
Optional query param:
- `projectId`

Behavior:
- elevated viewers can see workspace/project user list
- non-elevated callers get only their own resolved user record
- with `projectId`, the API may create missing `User` rows for project member names on demand

### `GET /timesheets/report`
Query params:
- `from`
- `to`
- `projectId`
- `clientId`
- `taskId`
- `userId`
- `showValidated=true`

Returns workspace-wide or filtered report entries plus summary.

### `POST /timesheets`
Request:
```json
{
  "projectId": "...",
  "taskId": "optional-task-id",
  "userId": "optional-user-id",
  "userName": "optional-user-name",
  "date": "2026-03-26",
  "minutes": 90,
  "description": "QA + polish",
  "billable": true,
  "validated": false
}
```

Rules:
- `projectId` and positive `minutes` required
- if `validated=true`, project owner permission is required
- non-elevated users cannot arbitrarily pick another user id
- if no `userId`, the API can upsert a workspace `User` by `userName`

### `PATCH /timesheets/:timesheetId`
Editable fields:
- `minutes`
- `description`
- `date`
- `billable`
- `validated`
- `taskId`
- `userId`

Extra restrictions:
- changing `validated` or `userId` requires project owner permission
- non-elevated callers cannot edit entries outside their own user scope

### `DELETE /timesheets/:timesheetId`
Deletes an entry if it is visible/editable to the caller.

---

## Uploads

### Task description / inline image upload
`POST /tasks/:taskId/image-upload`

Request:
```json
{
  "fileName": "mock.png",
  "mimeType": "image/png",
  "base64": "..."
}
```

Response:
```json
{ "ok": true, "url": "/uploads/task-images/<taskId>/<file>" }
```

Public file serving:
- `GET /uploads/task-images/:taskId/:fileName`

### Profile image upload
`POST /auth/profile/image-upload`

Public file serving:
- `GET /uploads/profile-images/:accountId/:fileName`

Notes:
- upload routes take base64 payloads, not multipart forms
- public serving means URLs must be treated as effectively bearerless/static once known

---

## Mention/discovery helpers

### `GET /mentionable-users`
Query params:
- `projectId` required
- `query` optional

Returns up to 20 workspace members, sorted with project members first, excluding the current account.

Shape:
```json
{
  "accountId": "...",
  "name": "Alex",
  "email": "alex@example.com",
  "avatarUrl": null
}
```

---

## Hosted MCP endpoint

Sally exposes a hosted MCP server at:
- `GET/POST/DELETE /mcp`

Implementation notes:
- backed by `StreamableHTTPServerTransport`
- uses MCP session ids via `Mcp-Session-Id` header
- authenticated through Sally hosted MCP keys
- each transport session is pinned to the authenticating MCP key
- if a session id is reused with a different key, the API returns `403`

### Hosted MCP auth

Use:
```http
Authorization: Bearer sallymcp_...
```

If the key is workspace-restricted, all tool calls are forced into that workspace.

### Tool coverage

The hosted MCP implementation calls back into the same HTTP API, not the database directly.

Current hosted tools include:

- workspace: `workspace.list`, `workspace.invite`
- clients: `client.list`, `client.get`, `client.create`, `client.update`, `client.delete`
- projects: `project.list`, `project.get`, `project.create`, `project.update`, `project.archive`, `project.delete`
- project membership: `project.member.list`, `project.member.add`, `project.member.update`, `project.member.remove`
- project statuses: `project.status.create`, `project.status.update`, `project.status.delete`
- tasks: `task.list`, `task.get`, `task.create`, `task.update`, `task.archive`, `task.delete`, `task.move`, `task.reorder`
- task labels/todos/comments: `task.labels.update`, `task.todo.create`, `task.todo.update`, `task.todo.delete`, `task.todo.reorder`, `comment.add`
- timesheets: `timesheet.list`, `timesheet.users`, `timesheet.report`, `timesheet.add`, `timesheet.update`, `timesheet.delete`

### Hosted MCP vs local `sally-mcp`

The repo also ships a local stdio MCP package in `apps/mcp`.

That package:
- connects to Sally over normal HTTP
- uses a personal Sally API key or hosted MCP key as credential
- supports additional tool families documented in `apps/mcp/README.md`, including profile, notification preferences, API key management, board/project summary, image upload, and workspace member management

The HTTP hosted `/mcp` tool list and the stdio package tool list are related but not identical, so keep that distinction in mind.

---

## CORS and client integration notes

Configured CORS origins are currently only:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Allowed headers:
- `Content-Type`
- `Authorization`
- `X-Api-Key`
- `X-Session-Token`
- `X-Workspace-Id`
- `X-Workspace-Slug`
- `Mcp-Session-Id`

This is enough for local dev and hosted MCP transport, but production frontend deployments behind a different origin may need explicit updates.

---

## Gaps / things that should become generated later

These are the highest-value candidates for OpenAPI or generated contract work:

1. **Route schema generation**
   - request bodies are handwritten and untyped at the HTTP boundary
   - responses are not consistently enveloped
   - there are no exported route schemas or JSON Schema objects

2. **Response normalization**
   - some endpoints return arrays directly
   - some return objects directly
   - some return `{ ok:true }` envelopes
   - error handling is mostly consistent, success handling is not

3. **Permission docs from code**
   - workspace/project permission rules are subtle
   - task visibility and timesheet visibility each have custom logic
   - generated policy docs/tests would help avoid regressions

4. **Workspace selector contract**
   - currently spread across headers and query params with several aliases
   - should be formalized in one reusable auth/workspace schema

5. **MCP tool parity docs**
   - hosted `/mcp` and local `sally-mcp` have overlapping but non-identical tool sets
   - this should later be generated from a single tool registry source

6. **Upload contract cleanup**
   - uploads are base64 JSON payloads today
   - if large assets matter, this should likely move to multipart or signed-upload flow with explicit limits/docs

---

## Source of truth

Primary implementation files:
- `apps/api/src/index.ts`
- `packages/db/prisma/schema.prisma`
- `apps/mcp/README.md`

If behavior changes, update this doc or generate it from code.