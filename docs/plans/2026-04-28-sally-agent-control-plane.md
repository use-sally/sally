# Sally Agent Control Plane Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make Sally the native source of truth and control plane for agent workflows while keeping Hermes/remote Hermes as the isolated execution runtime.

**Architecture:** Sally stores agent identities, project automation configuration, jobs, runs, blockers, approvals, and visible workflow state. Hermes workers claim Sally jobs, execute PM/specialist work with project skills/secrets, and write run/evidence results back to Sally. Secrets, tool execution, code/browser/SSH/Gmail access, and model calls stay outside Sally.

**Tech Stack:** Fastify API in `apps/api`, Prisma/Postgres in `packages/db`, Next.js UI in `apps/web`, existing Sally MCP tooling, external Hermes workers.

---

## Phase 1: Data model foundation

### Task 1: Add agent-control-plane vocabulary helpers

**Objective:** Define the initial normalized vocabulary for workflow stages, jobs/runs, approvals, blockers, agent roles, Hermes profile slugs, and capability names.

**Files:**
- Create: `apps/api/src/agent-control-plane.test.ts`
- Create: `apps/api/src/agent-control-plane.ts`

**TDD steps:**
1. Write tests for normalization and constants.
2. Run `pnpm --filter api test -- src/agent-control-plane.test.ts` and confirm failure because the module does not exist.
3. Implement helper module.
4. Re-run the same test command and confirm pass.
5. Run full API tests.

**Status:** implemented in this branch.

### Task 2: Add Prisma schema for Sally-native control plane

**Objective:** Add schema support for first-class agent orchestration records without executing agents inside Sally.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260428172000_add_agent_control_plane/migration.sql`

**Models added:**
- `AgentIdentity`
- `ProjectAutomationConfig`
- `AgentJob`
- `AgentRun`
- `ApprovalRequest`
- `Blocker`

**Enums added:**
- `PrincipalType`
- `WorkflowStage`
- `AgentJobStatus`
- `AgentRunStatus`
- `ApprovalType`
- `ApprovalStatus`
- `BlockerType`
- `BlockerStatus`

**Verification:**
- `pnpm exec prisma format --schema prisma/schema.prisma`
- `pnpm exec prisma validate --schema prisma/schema.prisma`
- `pnpm exec prisma generate --schema prisma/schema.prisma`
- `pnpm --filter api test`
- `pnpm --filter api build`

**Status:** implemented in this branch.

---

## Phase 2: API surface

### Task 3: Add agent identity endpoints

**Objective:** Let workspace owners/superadmins create and manage agent identities in Sally.

**Files:**
- Modify: `apps/api/src/index.ts`
- Add helper-level tests for normalization and secret-key rejection in `apps/api/src/agent-control-plane.test.ts`.

**Endpoints:**
- `GET /agents`
- `POST /agents`
- `GET /agents/:agentId`
- `PATCH /agents/:agentId`
- `POST /agents/:agentId/disable`
- `POST /agents/:agentId/enable`

**Rules:**
- Workspace OWNER or superadmin can create/update.
- MEMBER can read.
- Agents may optionally link to an `Account` but do not require email-backed accounts long term.
- Store capability names, allowed projects, and Hermes profile references as non-secret metadata only.
- Reject JSON metadata/payload objects containing secret-like keys such as token/password/privateKey/apiKey/credential/cookie.

**Status:** implemented in this branch.

### Task 4: Add project automation config endpoints

**Objective:** Move non-secret project workflow config from local YAML toward Sally.

**Endpoints:**
- `GET /projects/:projectId/automation`
- `PUT /projects/:projectId/automation`

**Fields:**
- workflow enabled
- default PM agent
- role-agent mapping
- baseline task ids
- required capability names
- live approval policy
- staging-first policy
- current workflow stage
- next role
- automation state

**Rules:**
- No secret values.
- Only store secret reference names/capability names, not credentials.

### Task 5: Add agent job endpoints

**Objective:** Make Sally the queue/job source of truth.

**Endpoints:**
- `POST /agent-jobs`
- `GET /agent-jobs`
- `POST /agent-jobs/:jobId/claim`
- `PATCH /agent-jobs/:jobId`

**Rules:**
- Humans/UI can enqueue jobs.
- Hermes workers claim jobs.
- Claim must be atomic enough for one worker to own a queued job.
- Jobs carry task/project/workflow metadata, not prompts with secrets.
- Job payload rejects secret-like JSON keys before storage.

**Status:** implemented in this branch.

### Task 6: Add agent run endpoints

**Objective:** Make running/completed Hermes work visible in Sally.

**Endpoints:**
- `POST /agent-runs`
- `PATCH /agent-runs/:runId`
- `POST /agent-runs/:runId/heartbeat`
- `GET /agent-runs` *(still pending; only creation/update/heartbeat implemented in the first API slice)*
- `GET /tasks/:taskId/agent-runs` *(pending)*
- `GET /projects/:projectId/agent-runs` *(pending)*

**Rules:**
- Hermes creates/updates runs.
- Sally displays status, timestamps, role, model/provider, safe summary, log URL, evidence URL, and error.
- Raw logs with secrets stay outside Sally; Sally stores safe links/references.
- Run metadata rejects secret-like JSON keys before storage.

**Status:** first write/update/heartbeat API slice implemented in this branch; read/query endpoints remain pending.

### Task 7: Add blocker and approval endpoints

**Objective:** Replace comment-only blocker/approval semantics with explicit auditable objects.

**Endpoints:**
- `POST /blockers`
- `PATCH /blockers/:blockerId`
- `POST /approval-requests`
- `PATCH /approval-requests/:approvalId/decision`

**Rules:**
- Approval decisions require a human account.
- Agent may request approval but not self-approve.
- Approval types include live deploy, credentials, payment/customer data, client decision, destructive action, publishing.

---

## Phase 3: MCP / worker contract

### Task 8: Expose control-plane MCP tools

**Objective:** Let Hermes workers use Sally-native job/run APIs through MCP.

**Tools:**
- `agent.list` — implemented
- `agent_job.create` — implemented
- `agent_job.list` — implemented as a practical queue inspection companion
- `agent_job.claim` — implemented
- `agent_job.update` — implemented
- `agent_run.create` — implemented
- `agent_run.update` — implemented
- `agent_run.heartbeat` — implemented
- `blocker.create` — pending
- `approval_request.create` — pending

**Rules:**
- MCP key restrictions must continue to enforce workspace access.
- Workers cannot claim jobs outside their workspace/project/role scope.
- Agent job payload and run metadata must contain safe references only; secret-like JSON keys are rejected by the REST API layer.

**Status:** agent/job/run MCP tool slice implemented in this branch. Blocker and approval MCP tools remain pending until their REST endpoints are added.

### Task 9: Add remote Hermes worker mode

**Objective:** Replace local queue glue with a Sally job claimant.

**Worker behavior:**
1. Poll/stream Sally `AgentJob` records.
2. Claim exactly one queued job.
3. Load configured Hermes profile.
4. Execute PM or specialist step.
5. Create/update `AgentRun` heartbeat/status.
6. Post safe task comments/todo/status updates.
7. Mark job succeeded/failed/blocked.

**This belongs in Hermes/worker repo, not Sally app.**

---

## Phase 4: UI

### Task 10: Add project automation panel

**Objective:** Show automation state where project managers already work.

**Files likely:**
- `apps/web/app/projects/[projectId]/page.tsx`
- new component under `apps/web/components/`

**UI:**
- workflow enabled/disabled
- current stage
- next role
- latest run
- active blocker
- pending approval
- start/pause/resume controls

### Task 11: Add task automation panel

**Objective:** Make each task show current agent activity and evidence.

**Files likely:**
- `apps/web/components/task-drawer.tsx`
- `apps/web/components/bottom-task-drawer.tsx`
- `apps/web/app/tasks/[taskId]/page.tsx`

**UI:**
- latest agent runs
- active job
- run status
- blocker card
- approval card
- dispatch/retry buttons for authorized users

---

## Phase 5: Migration from local Hermes queue

### Task 12: Bridge current Hermes runner to Sally jobs/runs

**Objective:** Keep current PM runner working while moving state into Sally.

**Approach:**
- current `/pm` Telegram command enqueues `AgentJob` in Sally instead of local Postgres
- Hermes worker claims Sally job
- local run directories remain evidence artifacts
- Sally receives `AgentRun` references to local/remote logs

### Task 13: Retire project-context duplication gradually

**Objective:** Move non-secret config into Sally while keeping secrets local to Hermes profiles.

**Keep in Sally:**
- role mapping
- workflow policy
- baseline task ids
- public URLs
- required capabilities
- approval policy

**Keep in Hermes/profile secrets:**
- SSH keys
- service-account JSON
- SMTP credentials
- API tokens
- model provider keys
- browser sessions/cookies

---

## Acceptance criteria

- Sally can show whether an agent workflow is idle, queued, running, blocked, failed, or complete.
- Sally can show which agent/role is currently responsible.
- Sally has explicit blockers and approvals, not only comments.
- Hermes can run remotely and claim jobs from Sally.
- Sally stores no secrets.
- Existing tasks/projects continue to work without automation enabled.
- Existing MCP API continues to work.
- Local Hermes queue can be deprecated without losing visibility.
