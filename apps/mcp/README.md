# sally_ MCP server

A stdio MCP server for `sally_` that talks to a remote or local `sally_` instance over its normal web domain.

## Auth model

Use **user-minted API keys** from `sally_`.

That is the intended model because:
- access rights come from the user behind the key
- MCP/agent actions inherit normal workspace/project permissions
- there is no need to share a global master key with agents

## Environment

Required:

- `SALLY_URL` — your `sally_` instance origin, for example:
  - `https://yourdomain.com`
  - or `https://yourdomain.com/api`
- `SALLY_API_KEY` — a user API key created via `sally_` account settings / `/auth/api-keys`

The MCP server derives the API base automatically:
- `https://yourdomain.com` -> `https://yourdomain.com/api`
- `https://yourdomain.com/api` -> unchanged

Optional:

- `SALLY_WORKSPACE_ID`
- `SALLY_WORKSPACE_SLUG`

## Run locally

```bash
cd apps/mcp
SALLY_URL=https://yourdomain.com \
SALLY_API_KEY=your_user_pat_here \
pnpm dev
```

## OpenClaw / generic stdio MCP config

```json
{
  "mcpServers": {
    "sally": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/projects/automatethis-pm/apps/mcp", "start"],
      "env": {
        "SALLY_URL": "https://yourdomain.com",
        "SALLY_API_KEY": "your_user_pat_here",
        "SALLY_WORKSPACE_SLUG": "sally"
      }
    }
  }
}
```

## Claude Code style stdio config

```json
{
  "mcpServers": {
    "sally": {
      "command": "node",
      "args": ["/absolute/path/to/projects/automatethis-pm/apps/mcp/dist/index.js"],
      "env": {
        "SALLY_URL": "https://yourdomain.com",
        "SALLY_API_KEY": "your_user_pat_here",
        "SALLY_WORKSPACE_SLUG": "sally"
      }
    }
  }
}
```

## Current tools

- `workspace.list`
- `project.list`
- `project.get`
- `project.create`
- `task.list`
- `task.get`
- `task.create`
- `task.update`
- `task.move`
- `task.comments`
- `comment.add`
- `timesheet.add`
- `notification.list`
- `notification.read`
- `notification.read_all`

## Notes

- The MCP server uses the existing API as the source of truth.
- It does not access the database directly.
- It is intended for LLM/developer workflows first.
- For external agent access, prefer **user API keys** over any global server-level key.
