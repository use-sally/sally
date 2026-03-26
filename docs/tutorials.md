# Sally tutorials + examples

This page gives practical end-to-end examples for humans, scripts, and agents.

Use it when you want to move quickly without reverse-engineering the whole API.

---

## Tutorial 1: log in and inspect your workspaces

### Step 1: log in

```bash
curl -X POST https://your-sally-domain.com/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{
    "email": "alex@example.com",
    "password": "StrongPassw0rd!"
  }'
```

Save the returned `sessionToken`.

### Step 2: get your account + memberships

```bash
curl https://your-sally-domain.com/api/auth/me \
  -H 'Authorization: Bearer YOUR_SESSION_TOKEN'
```

Use the membership list to decide which workspace to select.

---

## Tutorial 2: list projects in a workspace

If the account belongs to multiple workspaces, send a workspace selector.

```bash
curl https://your-sally-domain.com/api/projects \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'X-Workspace-Slug: sally'
```

This is the basic pattern most API users and agents should follow.

---

## Tutorial 3: create a project

```bash
curl -X POST https://your-sally-domain.com/api/projects \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'X-Workspace-Slug: sally' \
  -H 'Content-Type: application/json' \
  --data '{
    "name": "Website relaunch",
    "description": "Q2 launch work"
  }'
```

What happens automatically:
- a unique project slug is created
- default statuses are created:
  - Backlog
  - In Progress
  - Review
  - Done
- default project owners are attached

---

## Tutorial 4: create a task with labels and a checklist

```bash
curl -X POST https://your-sally-domain.com/api/tasks \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'X-Workspace-Slug: sally' \
  -H 'Content-Type: application/json' \
  --data '{
    "projectId": "YOUR_PROJECT_ID",
    "title": "Ship onboarding flow",
    "description": "Finalize the operator onboarding flow.",
    "priority": "P2",
    "status": "In Progress",
    "labels": ["frontend", "priority"],
    "todos": [
      { "text": "QA pass" },
      { "text": "Polish copy" },
      { "text": "Deploy" }
    ]
  }'
```

Notes:
- `statusId` is the most precise selector when you already know it
- if you omit status and statusId, Sally falls back to the first project status
- labels and todos are normalized and deduplicated

---

## Tutorial 5: move a task to Review

### By status name

```bash
curl -X POST https://your-sally-domain.com/api/tasks/YOUR_TASK_ID/move \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'X-Workspace-Slug: sally' \
  -H 'Content-Type: application/json' \
  --data '{ "targetStatus": "Review" }'
```

### By exact status id

```bash
curl -X PATCH https://your-sally-domain.com/api/tasks/YOUR_TASK_ID \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'X-Workspace-Slug: sally' \
  -H 'Content-Type: application/json' \
  --data '{ "statusId": "YOUR_STATUS_ID" }'
```

---

## Tutorial 6: invite a workspace member

Workspace owners can invite people by email:

```bash
curl -X POST https://your-sally-domain.com/api/auth/invite \
  -H 'Authorization: Bearer YOUR_SESSION_TOKEN_OR_API_KEY' \
  -H 'X-Workspace-Slug: sally' \
  -H 'Content-Type: application/json' \
  --data '{
    "email": "newuser@example.com",
    "role": "MEMBER"
  }'
```

Use this when you want the email-based onboarding flow.

If you already know the account id and want a direct membership add flow, use the workspace membership endpoints from `docs/api.md`.

---

## Tutorial 7: add a project member

```bash
curl -X POST https://your-sally-domain.com/api/projects/YOUR_PROJECT_ID/members \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'X-Workspace-Slug: sally' \
  -H 'Content-Type: application/json' \
  --data '{
    "email": "newuser@example.com",
    "name": "New User",
    "role": "MEMBER"
  }'
```

Use this when the person should work on the project directly.

---

## Tutorial 8: create a hosted MCP key

```bash
curl -X POST https://your-sally-domain.com/api/auth/mcp-keys \
  -H 'Authorization: Bearer YOUR_SESSION_TOKEN_OR_API_KEY' \
  -H 'Content-Type: application/json' \
  --data '{
    "label": "Claude hosted MCP",
    "workspaceId": "OPTIONAL_WORKSPACE_ID"
  }'
```

Typical result:

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

Store the token immediately. Like normal API keys, it should be treated as a secret.

---

## Tutorial 9: call hosted MCP manually

### Initialize

```bash
curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer YOUR_SALLY_MCP_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-03-26",
      "capabilities":{},
      "clientInfo":{"name":"manual-test","version":"1.0.0"}
    }
  }'
```

### Notify initialized

```bash
curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer YOUR_SALLY_MCP_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: YOUR_SESSION_ID' \
  --data '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
```

### List tools

```bash
curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer YOUR_SALLY_MCP_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: YOUR_SESSION_ID' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### Call a tool

```bash
curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer YOUR_SALLY_MCP_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: YOUR_SESSION_ID' \
  --data '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"workspace.list",
      "arguments":{}
    }
  }'
```

---

## Tutorial 10: create a task through hosted MCP

Example tool call payload:

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "task.create",
    "arguments": {
      "workspaceSlug": "sally",
      "projectId": "YOUR_PROJECT_ID",
      "title": "Validate hosted MCP flow",
      "description": "Confirm create/update/move behavior from MCP.",
      "status": "Backlog",
      "todos": [
        { "text": "Initialize session" },
        { "text": "Create task" },
        { "text": "Move to Review" }
      ]
    }
  }
}
```

This is a good smoke test because it touches:
- auth
- session handling
- workspace selection
- write permissions
- nested checklist payload handling

---

## Tutorial 11: get a timesheet report

```bash
curl 'https://your-sally-domain.com/api/timesheets/report?from=2026-03-01&to=2026-03-31' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'X-Workspace-Slug: sally'
```

Add filters as needed:
- `projectId`
- `clientId`
- `taskId`
- `userId`
- `showValidated=true`

---

## Recommended workflows for agents

### Safe read-first workflow
1. list workspaces
2. select one workspace
3. list projects
4. get project details
5. get or search tasks
6. only then mutate state

### Safe write workflow
1. verify exact workspace and project
2. fetch current statuses first
3. create/update the task with explicit `statusId` when possible
4. add comments describing what the automation changed
5. avoid assuming names are unique if ids are already known

### Useful habits
- prefer ids over names once discovered
- treat workspace selection as explicit when accounts belong to multiple workspaces
- treat key scope and role scope as separate checks
- revoke temporary test keys after experiments
