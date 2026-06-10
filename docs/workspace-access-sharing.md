# Workspace access, invite links, and shareable URLs

This page documents the current workspace/user access model in Sally and the shareable URL conventions used by the web UI.

## Canonical URL structure

Sally uses immutable IDs in URLs. Do not use workspace or project names as routing identifiers because names can change.

Canonical project URL:

```txt
/workspaces/:workspaceId/projects/:projectId
```

Canonical task URL:

```txt
/workspaces/:workspaceId/projects/:projectId/tasks/:taskId
```

Examples:

```txt
/workspaces/clx_workspace123/projects/clx_project456
/workspaces/clx_workspace123/projects/clx_project456/tasks/clx_task789
```

These URLs are designed to be safe to copy and send to another Sally user. The recipient still needs to be logged in and must have permission to access the workspace/project/task.

### Why the workspace ID is in the URL

Older Sally links such as `/projects/:projectId` or `/tasks/:taskId` depend on the user's currently selected workspace. That makes links fragile: another user may have a different active workspace or no active workspace at all.

Workspace-scoped URLs solve this by carrying the workspace context explicitly. When opened, the web app uses the workspace ID from the URL as the active workspace context before loading the project or task.

### Compatibility routes

The legacy routes still exist for compatibility:

```txt
/projects/:projectId
/tasks/:taskId
```

New UI-generated project/task links should prefer the canonical workspace-scoped structure.

## Superadmin and empty workspace state

Platform admins must not be locked out when there are no workspaces.

If all workspaces are deleted or archived:
- normal users without workspace membership see the workspace-access-needed screen
- `SUPERADMIN` and `ADMIN` accounts can still enter the app
- platform admins can still access admin areas such as Team and Workspaces
- platform admins can create a new workspace from the Workspaces area

This is intentional because workspace membership is not the source of truth for platform-admin capability.

## Workspace invites and invite links

Workspace invites create an `AccountInvite` record with a token and expiry.

The invite acceptance URL is:

```txt
/accept-invite?token=:inviteToken
```

If `APP_BASE_URL` is configured, the API can also return a full absolute invite URL. If it is not configured, the web UI can still construct a local absolute URL from `invitePath` and the browser origin.

Invite responses may include:

```json
{
  "ok": true,
  "emailed": false,
  "inviteId": "...",
  "inviteToken": "...",
  "invitePath": "/accept-invite?token=...",
  "inviteUrl": "https://sally.example.com/accept-invite?token=...",
  "expiresAt": "2026-06-16T12:00:00.000Z"
}
```

`inviteUrl` can be `null` when `APP_BASE_URL` is not configured.

### SMTP is optional for invite delivery

Sally can create invite links even when SMTP is not configured or delivery fails.

In that case, admins can copy the invite link from the UI and send it through another channel such as chat.

### Where invite links are visible

Invite links are visible in the Team area for:
- pending invite-only email addresses
- accounts that exist but have not activated a password yet
- accounts with pending workspace invites

Pending invited workspace members also expose a copyable invite link in the workspace/member management UI.

### Creating invite links for pre-created accounts

A platform admin can create an account from Team before the user logs in. If the admin then adds that account to a workspace and the account has no password yet, Sally creates or can create a pending invite link for that workspace.

This supports installations where admins prepare accounts and permissions first, then send users direct invite links manually.

## Project roles

Project memberships support:

- `OWNER`
- `MEMBER`
- `VIEWER`

### Project viewer behavior

A project `VIEWER` can:
- open the project
- see project tasks
- open task details

A project `VIEWER` cannot:
- create, edit, move, archive, or delete tasks
- edit project metadata
- manage statuses
- manage project automation
- manage project members

For privacy, project viewers do not see task people/assignee details. The API and web UI redact people fields such as owner, assignee, participants, and collaborators for viewer-scoped project reads.

Project viewer is useful for clients, stakeholders, auditors, or external users who need progress visibility without edit rights or staffing details.

## Sharing task links with other users

To share a task:

1. Open the task from a workspace-scoped project URL.
2. Copy the browser URL if it is already in the canonical shape:

   ```txt
   /workspaces/:workspaceId/projects/:projectId/tasks/:taskId
   ```

3. Send it to another Sally user.

The recipient must:
- be logged in
- have workspace access
- have project access
- have permission to view the task

If they lack permission, Sally should deny access instead of leaking task content.
