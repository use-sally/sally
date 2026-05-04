# Sally + Hermes Agent Workflow Framework

This document describes the end-user workflow for using Sally as the project control plane and Hermes as the local execution agent.

Example project:

```text
Build a small website for my barberstore.
```

---

## 1. The simple mental model

```text
+------------------+        +------------------+        +------------------+
|                  |        |                  |        |                  |
|       YOU        | -----> |      SALLY       | -----> |      HERMES      |
| Business owner   |        | Project manager  |        | Local AI worker  |
|                  | <----- | Source of truth  | <----- | Does the work    |
|                  |        |                  |        |                  |
+------------------+        +------------------+        +------------------+

You describe goals.       Sally organizes work.      Hermes executes tasks.
You approve decisions.    Sally stores state.        Hermes reports results.
You review results.       Sally shows blockers.      Hermes asks when blocked.
```

Sally is not the coding agent.
Hermes is not the project database.

Sally decides what should happen next.
Hermes does one bounded piece of work at a time.

---

## 2. The full workflow at a glance

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         END-USER WORKFLOW                            │
└──────────────────────────────────────────────────────────────────────┘

  1. Create project
        │
        ▼
  2. Describe desired outcome
        │
        ▼
  3. Create first task
        │
        ▼
  4. Connect local Hermes agent
        │
        ▼
  5. Start automation / queue PM step
        │
        ▼
  6. Sally creates bounded agent job
        │
        ▼
  7. Hermes claims and runs job
        │
        ▼
  8. Hermes reports result
        │
        ▼
  ┌───────────────────────────────────────────────┐
  │ Did Hermes finish, need input, or need approval?│
  └───────────────────────────────────────────────┘
        │                  │                  │
        │                  │                  │
        ▼                  ▼                  ▼
   Finished           Blocked            Approval needed
        │                  │                  │
        ▼                  ▼                  ▼
   Review result      You add info       You approve/deny
        │                  │                  │
        └──────────────┬───┴──────────────┬───┘
                       ▼                  ▼
                Sally reconciles     Workflow stops if denied
                       │
                       ▼
              Next bounded PM step
                       │
                       ▼
                  Repeat until done
```

---

## 3. Actors and responsibilities

```text
+----------------------+------------------------------------------------+
| Actor                | Responsibility                                 |
+----------------------+------------------------------------------------+
| You                  | Explain the business goal                      |
|                      | Provide missing details                         |
|                      | Approve or deny important decisions             |
|                      | Review the website                              |
+----------------------+------------------------------------------------+
| Sally                | Store project/task/workflow state               |
|                      | Queue bounded jobs                              |
|                      | Track approvals and blockers                    |
|                      | Decide the next safe step                       |
+----------------------+------------------------------------------------+
| Hermes               | Receive a single bounded job                    |
|                      | Execute it locally using tools and LLM          |
|                      | Report result, blocker, or approval request     |
|                      | Never silently deploy or bypass approval         |
+----------------------+------------------------------------------------+
```

---

## 4. Project lifecycle framework

Use this as the standard lifecycle for a non-technical user project.

```text
┌────────────┐
│  INTAKE    │
└─────┬──────┘
      │ User creates project/task
      ▼
┌────────────┐
│  CLARIFY   │
└─────┬──────┘
      │ Agent asks missing questions
      ▼
┌────────────┐
│   PLAN     │
└─────┬──────┘
      │ Agent proposes implementation approach
      ▼
┌────────────┐
│  APPROVE   │◄───────────────┐
└─────┬──────┘                │
      │ User approves plan     │ User requests changes
      ▼                       │
┌────────────┐                │
│   BUILD    │                │
└─────┬──────┘                │
      │ Agent creates first version
      ▼
┌────────────┐
│  PREVIEW   │
└─────┬──────┘
      │ User reviews locally
      ▼
┌────────────┐
│  REVISE    │────────────────┘
└─────┬──────┘
      │ Changes complete
      ▼
┌────────────┐
│  DEPLOY?   │
└─────┬──────┘
      │ Explicit approval required
      ▼
┌────────────┐
│   DONE     │
└────────────┘
```

---

## 5. Sally as the source of truth

```text
                     +----------------------+
                     |        SALLY         |
                     |  Source of Truth     |
                     +----------+-----------+
                                |
      +-------------------------+-------------------------+
      |                         |                         |
      ▼                         ▼                         ▼
+-------------+          +--------------+          +--------------+
|  Projects   |          |    Tasks     |          | Agent Jobs   |
+-------------+          +--------------+          +--------------+
| name        |          | title        |          | queued       |
| description |          | status       |          | claimed      |
| workspace   |          | assignee     |          | running      |
| automation  |          | comments     |          | succeeded    |
+-------------+          +--------------+          | failed       |
                                                   | blocked      |
                                                   +--------------+
      +-------------------------+-------------------------+
      |                         |                         |
      ▼                         ▼                         ▼
+-------------+          +--------------+          +--------------+
| Approvals   |          |  Blockers    |          | Agent Events |
+-------------+          +--------------+          +--------------+
| pending     |          | open         |          | job.created  |
| approved    |          | resolved     |          | blocker.*    |
| rejected    |          | cancelled    |          | approval.*   |
| cancelled   |          | reason       |          | workflow.*   |
+-------------+          +--------------+          +--------------+
```

Rule:

```text
If it matters, it belongs in Sally.
```

Do not rely on local chat memory as the source of truth.

---

## 6. Agent connection framework

```text
┌──────────────────────────────┐
│ 1. Sally creates pairing code │
└───────────────┬──────────────┘
                │ short-lived code
                ▼
┌──────────────────────────────┐
│ 2. Hermes completes pairing  │
└───────────────┬──────────────┘
                │ receives worker token
                ▼
┌──────────────────────────────┐
│ 3. Hermes stores token       │
└───────────────┬──────────────┘
                │ uses token for auth
                ▼
┌──────────────────────────────┐
│ 4. Hermes sends heartbeat    │
└───────────────┬──────────────┘
                │ Sally shows agent online
                ▼
┌──────────────────────────────┐
│ 5. Hermes watches events     │
└───────────────┬──────────────┘
                │ waits for work
                ▼
┌──────────────────────────────┐
│ 6. Hermes claims jobs        │
└───────────────┬──────────────┘
                │ executes bounded task
                ▼
┌──────────────────────────────┐
│ 7. Hermes reports result     │
└──────────────────────────────┘
```

Low-level route map:

```text
Admin/User side:

POST /agent-connections/pairing-code
POST /agent-connections/:connectionId/revoke
GET  /agent-connections

Worker side:

POST /agent-connections/complete-pairing
GET  /agent-worker/me
POST /agent-worker/heartbeat
GET  /agent-worker/events
GET  /agent-worker/events/stream
POST /agent-worker/events/ack
POST /agent-worker/reconcile-event
```

---

## 7. Job execution framework

```text
          Sally queues job
                │
                ▼
       event: job.created
                │
                ▼
       Hermes sees event
                │
                ▼
       Hermes claims job
                │
                ▼
       Sally marks CLAIMED
                │
                ▼
       Hermes creates run
                │
                ▼
       Sally marks RUNNING
                │
                ▼
       Hermes executes work
                │
        ┌───────┼────────┐
        │       │        │
        ▼       ▼        ▼
   Succeeded  Failed   Blocked
        │       │        │
        ▼       ▼        ▼
   Store     Store    Create blocker
   result    error    or approval
        │       │        │
        └───────┴────────┘
                │
                ▼
       Hermes acks event
```

---

## 8. Approval framework

Approvals are for business decisions or risky actions.

Examples:

- “Use a static website instead of WordPress?”
- “Use this design direction?”
- “Deploy publicly?”
- “Send this email to a client?”

```text
Hermes needs decision
        │
        ▼
Sally creates approval request
        │
        ▼
User sees Approve / Deny
        │
        ├────────────────────┐
        │                    │
        ▼                    ▼
 User approves          User denies
        │                    │
        ▼                    ▼
event: approval.resolved  event: approval.resolved
        │                    │
        ▼                    ▼
Hermes asks Sally to       Hermes asks Sally to
reconcile workflow         reconcile workflow
        │                    │
        ▼                    ▼
Sally queues next          Sally stops workflow
bounded PM step            cleanly with reason
```

Important rule:

```text
Approval does not mean “resume old memory”.
Approval means “Sally re-checks live state and decides the next safe step”.
```

---

## 9. Blocker framework

Blockers are for missing input, missing access, unclear requirements, or tool failures.

Examples:

- “Need your address and phone number.”
- “Need a logo file.”
- “Need hosting credentials.”
- “Cannot deploy because domain is not connected.”

```text
Hermes is blocked
        │
        ▼
Sally creates blocker
        │
        ▼
User sees required input
        │
        ├────────────────────┐
        │                    │
        ▼                    ▼
 User resolves          User cancels
        │                    │
        ▼                    ▼
event: blocker.resolved  event: blocker.resolved
        │                    │
        ▼                    ▼
Hermes asks Sally to       Hermes asks Sally to
reconcile workflow         reconcile workflow
        │                    │
        ▼                    ▼
Sally queues next          Sally stops workflow
bounded PM step            cleanly with reason
```

---

## 10. Safe resume framework

This is the core safety rule.

```text
BAD:

Approval resolved
      │
      ▼
Agent continues old local context blindly
      │
      ▼
Potential stale/unsafe action

GOOD:

Approval/blocker resolved
      │
      ▼
Sally records event
      │
      ▼
Hermes sees event
      │
      ▼
Hermes calls reconcile endpoint
      │
      ▼
Sally re-fetches live state
      │
      ▼
Sally decides next bounded step
      │
      ▼
Fresh PM job is queued if safe
```

---

## 11. Barberstore website example flow

```text
You:
  “Build a website for my barberstore.”
        │
        ▼
Sally:
  Creates project + task
        │
        ▼
Hermes PM:
  “I need name, services, prices, hours, address, style.”
        │
        ▼
You:
  Provides details
        │
        ▼
Hermes PM:
  “I recommend a simple static one-page site for v1.”
        │
        ▼
You:
  Approves
        │
        ▼
Hermes Builder:
  Creates local website
        │
        ▼
You:
  Opens preview URL
        │
        ▼
You:
  Requests changes
        │
        ▼
Hermes Builder:
  Revises
        │
        ▼
Hermes PM:
  “Ready to deploy?”
        │
        ▼
You:
  Approves deployment
        │
        ▼
Hermes Infra/Builder:
  Deploys
        │
        ▼
Sally:
  Marks project/task done
```

---

## 12. End-user checklist

```text
[ ] Sally is running
[ ] Hermes is installed
[ ] Hermes has an LLM connected
[ ] Sally workspace exists
[ ] Sally project exists
[ ] First task describes the desired outcome
[ ] Hermes agent is paired with Sally
[ ] Worker terminal is running
[ ] Sally shows agent online
[ ] Project automation has been started
[ ] Approvals/blockers are handled inside Sally
[ ] Results are reviewed before deployment
```

---

## 13. What the product should hide from non-technical users

The end-user should not need to understand this:

```text
┌──────────────────────────────────────────────────────────────┐
│               CURRENT TECHNICAL IMPLEMENTATION               │
├──────────────────────────────────────────────────────────────┤
│ pairing code                                                  │
│ worker token                                                  │
│ bearer auth                                                   │
│ event cursor                                                  │
│ SSE stream                                                    │
│ heartbeat                                                     │
│ job claim                                                     │
│ agent run                                                     │
│ runtime config JSON                                           │
│ local shell loop                                              │
└──────────────────────────────────────────────────────────────┘
```

The desired user experience should be:

```text
┌──────────────────────────────────────────────────────────────┐
│                    DESIRED END-USER UX                       │
├──────────────────────────────────────────────────────────────┤
│ 1. Click “Connect Hermes” in Sally                            │
│ 2. Copy one command                                           │
│ 3. Paste into Terminal                                        │
│ 4. Sally says “Agent online”                                  │
│ 5. Click “Start automation”                                   │
│ 6. Review/approve results                                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 14. Framework summary

```text
             ┌──────────────┐
             │     USER     │
             └──────┬───────┘
                    │ goals, answers, approvals
                    ▼
             ┌──────────────┐
             │    SALLY     │
             └──────┬───────┘
                    │ bounded jobs + events
                    ▼
             ┌──────────────┐
             │    HERMES    │
             └──────┬───────┘
                    │ results, blockers, approval requests
                    ▼
             ┌──────────────┐
             │    SALLY     │
             └──────┬───────┘
                    │ next safe step
                    ▼
             ┌──────────────┐
             │    REPEAT    │
             └──────────────┘
```

One-line rule:

```text
Sally manages truth and workflow; Hermes executes bounded work; the user approves important decisions.
```
