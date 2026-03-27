# sally-mcp

MCP server for **Sally**.

`sally-mcp` lets MCP-compatible clients talk to a Sally instance over its normal web API using a **personal user API key** minted inside Sally.

## Install

```bash
npm install -g sally-mcp
```

Hosted MCP inside Sally is now the primary path at `/mcp`. The local `sally-mcp` stdio package remains available for advanced or legacy setups.

## Required environment

```bash
SALLY_URL=https://your-sally-domain.com
SALLY_USER_API_KEY=your_personal_sally_api_key_or_hosted_mcp_key
```

That is enough for the normal setup.

Access is defined entirely by the Sally user behind the API key.

## Optional advanced restriction

If you want one MCP server to be pinned to a single workspace, you can also set:

```bash
SALLY_WORKSPACE_SLUG=your-workspace-slug
```

That is useful when different agents should be restricted to different workspaces.

No workspace id is needed.
No global server key is needed.

## Run locally

```bash
SALLY_URL=https://your-sally-domain.com \
SALLY_USER_API_KEY=your_personal_sally_api_key_or_hosted_mcp_key \
sally-mcp
```

## OpenClaw / generic stdio MCP config

```json
{
  "mcpServers": {
    "sally": {
      "command": "sally-mcp",
      "env": {
        "SALLY_URL": "https://your-sally-domain.com",
        "SALLY_USER_API_KEY": "your_personal_sally_api_key"
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
      "command": "sally-mcp",
      "env": {
        "SALLY_URL": "https://your-sally-domain.com",
        "SALLY_USER_API_KEY": "your_personal_sally_api_key"
      }
    }
  }
}
```

## Workspace selection behavior

- Default: no workspace restriction in config.
- Optional advanced restriction: set `SALLY_WORKSPACE_SLUG` to pin one MCP server to one workspace.
- If no workspace slug is configured, access is determined entirely by the Sally user and the API key behind it.

## Tool families

### Workspace and account

- `workspace.list`
- `workspace.members.list`
- `workspace.members.add`
- `workspace.members.update`
- `workspace.members.remove`
- `workspace.invite`
- `profile.get`
- `profile.update`
- `profile.image_upload`
- `api_keys.list`
- `api_keys.create`
- `api_keys.revoke`

### Notifications

- `notification.list`
- `notification.read`
- `notification.read_all`
- `notification.preferences.get`
- `notification.preferences.update`

### Clients and discovery

- `mentionable_users.list`
- `client.list`
- `client.create`
- `client.get`
- `client.update`
- `client.delete`
- `project.summary`
- `board.get`

### Projects

- `project.list`
- `project.create`
- `project.get`
- `project.update`
- `project.archive`
- `project.delete`
- `project.members.list`
- `project.members.add`
- `project.members.update`
- `project.members.remove`
- `project.activity`
- `project.labels.create`
- `project.statuses.create`
- `project.statuses.update`
- `project.statuses.delete`

### Tasks, comments, labels, todos, uploads

- `task.list`
- `task.get`
- `task.create`
- `task.update`
- `task.move`
- `task.reorder`
- `task.archive`
- `task.delete`
- `task.comments`
- `comment.add`
- `task.labels.update`
- `task.todos.create`
- `task.todos.update`
- `task.todos.delete`
- `task.todos.reorder`
- `task.image_upload`

### Timesheets

- `timesheet.add`
- `timesheet.update`
- `timesheet.delete`
- `timesheet.project_list`
- `timesheet.task_list`
- `timesheet.users`
- `timesheet.report`

## Notes

- `sally-mcp` uses Sally's normal HTTP API as the source of truth.
- It does not access the database directly.
- Each user should mint and use their own Sally API key.
- Permissions are inherited from the real Sally user behind that key.
- Owner-only operations remain owner-only. The MCP server does not bypass Sally permissions.
- Login, invite acceptance, password reset, and other email/token flows are intentionally not exposed as MCP tools because they are not practical authenticated agent actions with a minted user API key.
