# Owner + Participants Migration Plan

> For Hermes: use subagent-driven-development skill to implement this plan task-by-task.

Goal: replace the current task assignment model (`assignee` + `collaborators`) with a canonical backend model of `owner` + `participants`, while keeping live installs and `create-sally` update flows safe through compatibility fallbacks.

Architecture: introduce a new canonical relation layer in the database and API, keep compatibility aliases for one rollout, then migrate the web app to consume the canonical fields. The npm installer/updater must detect and safely apply the migration path during `create-sally update`, including mixed-state databases.

Tech Stack: Prisma/Postgres, Fastify API, Next.js web app, create-sally updater, TypeScript shared types.

---

## Migration target

Canonical task people model:
- one owner per task
- ordered participants list including the owner in position 0
- role per participant: OWNER | PARTICIPANT

Compatibility during rollout:
- database keeps legacy `Task.assignee` and `TaskCollaborator` temporarily
- API returns both canonical fields and compatibility aliases
- write paths update both canonical and legacy representations
- updater applies schema migration and backfills legacy installs

---

## Files expected to change

Database/schema/migrations:
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_task_owner_and_participants/migration.sql`

API:
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/task-people.ts`
- Create test: `apps/api/src/task-people.test.ts`
- Possibly update: `apps/api/src/task-collaborators.test.ts`

Shared types:
- Modify: `packages/types/src/index.ts`

Web:
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/task-people-helpers.ts`
- Modify: `apps/web/components/task-people-field.tsx`
- Modify: `apps/web/components/task-people-avatar-stack.tsx`
- Modify: `apps/web/components/task-board.tsx`
- Modify: `apps/web/components/task-drawer.tsx`
- Modify: `apps/web/components/inline-task-panel.tsx`
- Modify: `apps/web/components/editable-task-row.tsx`
- Modify: `apps/web/components/project-current-tasks.tsx`
- Modify: `apps/web/components/project-tasks-table.tsx`
- Modify: `apps/web/app/tasks/[taskId]/page.tsx`
- Create/modify tests under `apps/web/components/*.test.ts` and `apps/web/lib/*.test.ts`

Installer/updater:
- Modify: `apps/create-sally/src/index.ts`
- Modify docs: `docs/update-sally.md`

---

## Task 1: Define canonical schema

Objective: add canonical owner/participants storage without breaking current installs.

Files:
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_task_owner_and_participants/migration.sql`

Step 1: add new schema fields/models
- `Task.owner` (String?)
- `Task.participants` relation
- new `TaskParticipant` model with:
  - taskId
  - participant
  - role (`OWNER` | `PARTICIPANT`)
  - position
  - createdAt
- keep legacy `assignee` and `collaborators` for compatibility

Step 2: write migration SQL that:
- creates enum if needed for participant role
- creates `TaskParticipant`
- backfills owner from `Task.assignee`
- inserts participants in this order:
  1. owner first if present
  2. legacy collaborators after owner preserving deterministic order
- creates uniqueness constraints:
  - one `(taskId, participant)`
  - one owner per task
  - unique `(taskId, position)`

Step 3: verify migration SQL is idempotent enough for updater repair flows
- handle partially initialized installs carefully
- avoid destructive rewrite of legacy data during first rollout

Step 4: commit schema + migration

---

## Task 2: Add task people helper layer in API

Objective: centralize read/write conversion between canonical and legacy task people representations.

Files:
- Create: `apps/api/src/task-people.ts`
- Create test: `apps/api/src/task-people.test.ts`

Step 1: write failing tests for:
- deriving canonical participants from legacy rows
- deriving legacy aliases from canonical rows
- normalizing owner + participants order
- deduplicating owner from additional participants
- ensuring owner occupies position 0

Step 2: run failing tests

Step 3: implement helpers:
- normalizeTaskPeople(owner, participants)
- buildLegacyTaskPeopleAliases(...)
- buildTaskParticipantWrites(...)
- resolveVisibleTaskPeople(...)

Step 4: rerun tests

Step 5: commit helper layer

---

## Task 3: Switch API reads to canonical model with compatibility aliases

Objective: API responses expose canonical fields while still returning legacy aliases for old clients.

Files:
- Modify: `apps/api/src/index.ts`
- Modify: `packages/types/src/index.ts`

Step 1: extend shared types with canonical fields
- add `TaskParticipant`
- add `owner`, `ownerAvatarUrl?`, `participants`
- keep `assignee`, `assigneeAvatarUrl?`, `collaborators`

Step 2: update API queries to include `participants`
- board
- project detail/recent tasks
- task list
- task detail

Step 3: map API responses so they include both:
- canonical: `owner`, `participants`
- compatibility: `assignee`, `collaborators`

Step 4: update task filtering and permission checks to read from canonical source first, but preserve legacy behavior

Step 5: run API tests/build checks

Step 6: commit API read compatibility

---

## Task 4: Switch API writes to dual-write canonical + legacy

Objective: create/update flows persist canonical fields and still maintain legacy columns for compatibility.

Files:
- Modify: `apps/api/src/index.ts`
- Modify/add tests in `apps/api/src/*.test.ts`

Step 1: write failing tests for create/update payloads using:
- legacy fields only
- canonical fields only
- mixed payloads

Step 2: define canonical request shape additions
- `owner?: string`
- `participants?: string[]`
- possibly `participantRoles` only if needed later; skip for now

Step 3: update task.create / task.update handlers:
- canonicalize payload
- write `Task.owner`
- write `TaskParticipant` rows
- maintain `Task.assignee` and `TaskCollaborator` aliases during rollout

Step 4: update MCP tool schemas to accept canonical fields while keeping old fields supported

Step 5: rerun tests

Step 6: commit dual-write API layer

---

## Task 5: Migrate web app to canonical fields

Objective: web reads canonical fields first and falls back to legacy aliases.

Files:
- Modify: `packages/types/src/index.ts`
- Modify web task UI files listed above
- Modify tests in `apps/web/components/*.test.ts` and `apps/web/lib/*.test.ts`

Step 1: update helper functions/components to read:
- `owner` / `participants` when present
- fallback to `assignee` / `collaborators`

Step 2: update task people menu semantics:
- first person = owner
- remaining = participants
- compatibility mapping remains invisible to users

Step 3: keep copy as `People`, `First person`, `Additional people`

Step 4: add/extend tests proving canonical and compatibility payloads both render correctly

Step 5: run `pnpm --filter web test`

Step 6: run `pnpm --filter web build`

Step 7: commit web migration

---

## Task 6: Make create-sally update path safe

Objective: ensure npm installer/updater can migrate existing deployments automatically.

Files:
- Modify: `apps/create-sally/src/index.ts`
- Modify: `docs/update-sally.md`

Step 1: inspect current updater repair flow around:
- baseline init reconcile
- blocked-status repair
- `prisma migrate deploy`

Step 2: add new migration-state inspection for owner/participants rollout
- detect missing `TaskParticipant`
- detect partial state where canonical table exists but legacy/canonical backfill incomplete

Step 3: add pre-deploy repair/backfill if needed
- only for safe/recognized states
- fail loudly on ambiguous drift

Step 4: confirm updater still runs:
- baseline resolve when needed
- migrate deploy
- bootstrap
- restart
- health checks

Step 5: document new update expectations in `docs/update-sally.md`

Step 6: commit updater safety changes

---

## Task 7: Final rollout verification

Objective: verify app, migrations, and updater readiness before live rollout.

Files:
- No new files required; use terminal verification

Step 1: run focused tests
- `pnpm --filter api test`
- `pnpm --filter web test`

Step 2: run builds
- `pnpm --filter api build`
- `pnpm --filter web build`
- `pnpm --filter create-sally build`

Step 3: verify migration behavior on realistic local DB states
- fresh DB
- initialized DB with missing baseline marker
- initialized DB missing new canonical table

Step 4: verify local update path using `create-sally update` style reproduction if needed

Step 5: prepare live deploy checklist
- deploy app code
- run updater/migrations
- restart services
- smoke test login, projects, board, tasks, people menu

---

## Notes

- Do not remove legacy `assignee` / `collaborators` in the same rollout.
- Canonical source should become `owner` + `participants`, but compatibility aliases must remain for at least one deployment cycle.
- The updater path is a first-class requirement, not an afterthought.
- Prefer explicit backfill SQL in the migration over runtime lazy backfill.
