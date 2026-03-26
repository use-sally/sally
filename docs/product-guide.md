# Sally product + workflow guide

Sally is a project management system built for teams that want a clean operational surface instead of a bloated collaboration suite.

The core idea is simple:
- keep the web UI low-noise and usable
- keep the API real and scriptable
- make agents and automations first-class citizens instead of awkward add-ons

## Mental model

Think of Sally as five connected layers:

1. **accounts**
   - people log in
   - people can create API keys and hosted MCP keys

2. **workspaces**
   - the top-level collaboration boundary
   - memberships and permissions start here

3. **projects**
   - work containers inside a workspace
   - each project has statuses, tasks, activity, and members

4. **tasks**
   - the unit of execution
   - tasks can carry assignees, descriptions, labels, todos, comments, due dates, and timesheets

5. **machine interfaces**
   - HTTP API
   - hosted MCP at `/mcp`
   - local stdio MCP via `sally-mcp`

## Who Sally is for

Sally is especially suited to teams that:
- work in delivery, operations, support, or implementation
- care about self-hosting
- want direct API access
- want agents or scripts to read and update project state safely
- dislike PM tools that hide core workflows behind decorative UI

## Current features

### Accounts and auth
- email/password login
- session tokens
- personal API keys
- hosted MCP keys
- profile editing
- profile image upload
- password reset
- invite acceptance flow

### Workspace management
- list visible workspaces
- create workspaces (superadmin)
- manage workspace memberships
- invite members by email
- workspace-scoped access control

### Projects
- create and update projects
- archive and delete projects
- default project statuses: Backlog, In Progress, Review, Done
- custom project statuses
- project activity log
- project members with roles
- client linking

### Tasks
- create, update, archive, delete
- move between statuses
- reorder within columns
- descriptions
- priorities
- due dates
- labels
- todos/checklists
- comments and mentions
- inline image upload for task descriptions

### Clients
- create, view, update, delete
- attach clients to projects

### Notifications
- task assignment notifications
- comment mention notifications
- in-app notification preferences
- notification email delivery processing

### Timesheets
- project and task timesheets
- workspace-wide reporting
- billable and validated flags
- project/user/client filters

### MCP
- hosted MCP endpoint at `/mcp`
- hosted MCP keys tied to real Sally accounts
- local stdio MCP package for advanced setups

## How Sally usually gets used

### Human-first workflow
1. sign in
2. pick a workspace
3. create or open a project
4. define statuses if the defaults are not enough
5. create tasks and assign owners
6. track progress on board/project/task pages
7. log time when needed

### Agent-first workflow
1. mint an API key or hosted MCP key
2. select the correct workspace
3. list projects or board state
4. create/update tasks, comments, labels, todos, or timesheets
5. leave the web UI as the human control surface

### Mixed workflow
A typical real team does both:
- humans work in the UI
- scripts sync external state
- agents summarize, update, triage, and create tasks
- owners keep control via Sally's normal role model

## Roles and permissions

There are two main permission layers:

### Workspace roles
- `OWNER`
- `MEMBER`
- `VIEWER`

### Project roles
- `OWNER`
- `MEMBER`
- `VIEWER`

General rule of thumb:
- owners manage structure and membership
- members do normal project work
- viewers read but do not actively change project state

For exact behavior and edge cases, use:
- [`docs/api.md`](./api.md)

## Hosted MCP vs local stdio MCP

### Hosted MCP (`/mcp`)
Use this when you want:
- the simplest client setup
- remote access through your Sally domain
- hosted MCP keys managed inside Sally

### Local stdio MCP (`sally-mcp`)
Use this when you want:
- local agent tooling
- stdio-based MCP clients
- more advanced or legacy client setups

The tool families overlap heavily, but they are not identical. Always check the current docs before assuming parity.

## What Sally is not trying to be

Sally is not trying to be:
- a giant all-in-one enterprise suite
- a document/wiki platform
- a chat replacement
- a generic “productivity OS” full of ornamental features

It is trying to be a solid operational core for project and task execution.

## Recommended next steps

- For install: [`ubuntu-debian-install.md`](./ubuntu-debian-install.md)
- For API integration: [`api.md`](./api.md)
- For MCP usage: [`mcp.md`](./mcp.md)
- For practical examples: [`tutorials.md`](./tutorials.md)
