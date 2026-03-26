# Sally MCP guide

Sally supports two MCP patterns:

1. **hosted MCP** exposed directly by the Sally API at `/mcp`
2. **local stdio MCP** via the `sally-mcp` package in `apps/mcp`

For most users, the recommended default is **hosted MCP**.

---

## Quick decision guide

Choose **hosted MCP** if you want:
- the cleanest setup
- a URL-based MCP server
- remote clients connecting directly to Sally
- key management inside the Sally product

Choose **stdio `sally-mcp`** if you want:
- a local CLI process
- older or stricter MCP clients that expect stdio
- extra tool families exposed by the local MCP wrapper

---

## Hosted MCP

### Endpoint

```text
https://your-sally-domain.com/mcp
```

Local dev example:

```text
http://127.0.0.1:4000/mcp
```

### Authentication

Hosted MCP uses a Sally hosted MCP key:

```http
Authorization: Bearer sallymcp_...
```

These keys:
- belong to a real Sally account
- inherit that account's permissions
- may optionally be restricted to a single workspace

### Important transport behavior

Hosted MCP uses streamable HTTP transport.

Practical implications:
- your client should accept `text/event-stream`
- you must initialize the MCP session before calling tools
- the server issues an `Mcp-Session-Id` / `mcp-session-id` header
- subsequent calls must keep using that session id

### Minimal hosted MCP flow

1. `initialize`
2. `notifications/initialized`
3. `tools/list`
4. `tools/call`

### Example initialize request

```bash
curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer sallymcp_...' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "curl-test", "version": "1.0.0" }
    }
  }'
```

### Example initialize notification

```bash
curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer sallymcp_...' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: YOUR_SESSION_ID' \
  --data '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized",
    "params": {}
  }'
```

### Example tools/list

```bash
curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer sallymcp_...' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'mcp-session-id: YOUR_SESSION_ID' \
  --data '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### Hosted MCP tool families

The hosted MCP server currently exposes tool families around:
- workspaces
- workspace invites
- clients
- projects
- project members
- project statuses
- tasks
- task labels, todos, comments
- timesheets

Use [`docs/api.md`](./api.md) for the implementation-backed list.

### Hosted MCP gotchas

#### `406 Not Acceptable`
Your client is not accepting `text/event-stream`.

#### `Bad Request: Server not initialized`
You called a tool before running `initialize`.

#### `MCP session not found`
Your session expired or you reused an old session id.

#### `Unauthorized`
The key is invalid, revoked, or missing permission.

#### Workspace access denied by MCP key restriction
The key is pinned to a different workspace than the one your request tried to select.

---

## Local stdio MCP (`sally-mcp`)

### Required environment

```bash
SALLY_URL=https://your-sally-domain.com
SALLY_USER_API_KEY=atpm_...  # or a hosted MCP key if desired
```

Optional restriction:

```bash
SALLY_WORKSPACE_SLUG=sally
```

### Run manually

```bash
SALLY_URL=https://your-sally-domain.com \
SALLY_USER_API_KEY=atpm_... \
sally-mcp
```

### Example stdio config

```json
{
  "mcpServers": {
    "sally": {
      "command": "sally-mcp",
      "env": {
        "SALLY_URL": "https://your-sally-domain.com",
        "SALLY_USER_API_KEY": "atpm_your_personal_key"
      }
    }
  }
}
```

### Why use stdio MCP?

It is useful when:
- your MCP client prefers local processes
- you want a stable CLI-based setup
- you want the additional tool families documented in `apps/mcp/README.md`

---

## Hosted MCP vs stdio MCP

### Shared idea
Both variants:
- talk to the same Sally HTTP API
- inherit real Sally user permissions
- do not bypass role checks

### Difference
Hosted `/mcp` is the built-in remote MCP server.

` sally-mcp` is a local wrapper that talks to Sally over HTTP and exposes tools over stdio.

The tool lists overlap, but they are not guaranteed to be identical at every moment.

---

## Security model

MCP access is only as broad as the Sally user behind the key.

That means:
- owner-only actions remain owner-only
- workspace restrictions still apply
- project restrictions still apply
- revoking the key cuts off the client

Recommended practice:
- mint separate keys per client or automation
- label keys clearly
- restrict hosted keys to a workspace when possible
- revoke test keys after debugging

---

## Recommended testing checklist

When validating a Sally MCP deployment, test in this order:

1. `initialize`
2. `tools/list`
3. one safe read call like `workspace.list` or `project.list`
4. one write call like `project.create`
5. one nested write call like `task.create` with todos
6. one membership or invite flow if your deployment exposes it

This catches:
- transport issues
- session handling problems
- auth problems
- workspace scoping mistakes
- write-permission mismatches

---

## Source of truth

Primary references:
- `apps/api/src/index.ts`
- `apps/mcp/README.md`
- `apps/mcp/src/index.ts`
- [`docs/api.md`](./api.md)
