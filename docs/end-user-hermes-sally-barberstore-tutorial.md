# Sally + Hermes End-User Tutorial: Building a Small Barberstore Website

## Scenario

You installed:

- Sally locally
- Hermes locally
- an LLM provider inside Hermes
- you created a Sally workspace
- you created a Sally project called something like `Barberstore Website`

Your goal:

> Build a small website for my barberstore.

## Mental model

Sally is the project manager / control center.

Hermes is the worker/agent that does the actual work.

You are the client/business owner who approves decisions.

The browser UI never builds the website by itself. The browser tells Sally what you want. Sally creates bounded work. Hermes connects to Sally, receives the work, does it, and reports back.

---

## 1. Create the project in Sally

In Sally:

1. Open your workspace.
2. Click `New Project`.
3. Name it:

```text
Barberstore Website
```

4. In the project description, write something simple:

```text
I want a small website for my barberstore. It should have a homepage, services/pricing, opening hours, contact info, location, and a button to book an appointment. I want a clean modern style, masculine but friendly. I do not know what tech stack to use.
```

Do not worry about technical details.

---

## 2. Add the first task

Inside the project, create one task.

Title:

```text
Plan and build first version of barberstore website
```

Description:

```text
Create a simple website for my barberstore. First ask for any missing business details if needed. Then propose the structure, build a first version, and show me how to preview it locally.
```

Add any known details:

- Store name
- Address
- Phone number
- Opening hours
- Services and prices
- Booking link if you already have one
- Style preferences
- Competitor/example websites you like

Example:

```text
Store name: Alex Barber
Services: Haircut 30€, Beard trim 20€, Haircut + Beard 45€
Opening hours: Mon-Fri 10-19, Sat 10-16
Location: Warsaw
Style: dark, premium, simple
Booking: no booking system yet, use phone number for now
```

If you do not know something, leave it out. The agent should ask.

---

## 3. Connect Hermes as an agent

In Sally, go to the project automation / agents area.

You want to create an agent connection.

Conceptually, you do this:

1. Click something like `Connect agent`, `Pair agent`, or `Create pairing code`.
2. Choose runtime type:

```text
Hermes
```

3. Give it a name:

```text
Local Hermes Agent
```

4. Sally shows you a short pairing code.
5. Copy that pairing code.

That pairing code is temporary. It is only used once so Hermes can get a private worker token.

---

## 4. Pair your local Hermes worker

On your computer, open Terminal.

You need a worker process that connects Hermes to Sally.

Product-intended flow should eventually be something like:

```bash
hermes sally connect
```

or:

```bash
sally agent connect
```

Then it asks for:

- Sally URL
- pairing code
- which Hermes profile to use

For the current local/dev setup, the rough flow is:

- Sally creates a worker token from the pairing code.
- The local worker stores that token.
- The worker uses that token to watch Sally for jobs/events.
- When Sally queues work, Hermes runs.

If you are testing from the current `sally-app` checkout, the current worker is not yet a polished double-click installer experience. It is a developer/MVP worker. It can be run from the repo.

Example local worker loop:

```bash
cd /Users/alexhammerschmied/projects/sally-app

export SALLY_API_BASE_URL="http://localhost:4000"
export SALLY_WORKSPACE_SLUG="your-workspace-slug"
export SALLY_API_KEY="sally_worker_xxx_from_pairing"

export SALLY_RUNTIME_CONFIG='{
  "runtimes": {
    "hermes": {
      "enabled": true,
      "command": "hermes",
      "defaultArgs": [],
      "allowedRepoPaths": [],
      "capabilities": ["pm", "code", "git", "tools"],
      "timeoutMs": 1800000
    }
  }
}'

while true; do
  pnpm --filter api tsx src/local-sally-worker.ts
  sleep 5
done
```

Plain-English version:

- `SALLY_API_BASE_URL` tells Hermes where Sally is.
- `SALLY_WORKSPACE_SLUG` tells it which workspace to listen to.
- `SALLY_API_KEY` is the private worker token from pairing.
- `SALLY_RUNTIME_CONFIG` tells the Sally worker: “when a job arrives, use the `hermes` command to execute it.”
- The `while true` loop keeps the worker alive.

---

## 5. Start project automation in Sally

Now go back to Sally.

Inside the `Barberstore Website` project, you should have an automation/project panel.

Click something like:

```text
Start automation
```

or:

```text
Run PM
```

or:

```text
Queue PM step
```

What should happen:

1. Sally creates a PM job.
2. Connected Hermes sees `job.created`.
3. Hermes claims the job.
4. Hermes reads the project/task details.
5. Hermes decides the next bounded step.

For your barberstore example, the first PM step should probably not immediately code. It should first clarify missing business details or propose a plan.

Expected first result might be:

```text
I can build this. Missing details:
- exact business name
- address
- phone/email
- booking preference
- logo availability
- preferred colors
- whether this should be a static site or connected to a CMS
```

Or it might propose:

```text
Step 1: create landing page structure.
Step 2: build static website.
Step 3: preview locally.
Step 4: ask for approval before deployment.
```

---

## 6. Approve or answer questions

If Hermes needs a decision, Sally should show an approval request.

Example approval:

```text
Use a simple static website instead of WordPress for the first version?
```

Buttons:

- `Approve`
- `Deny`

As the end-user, you click one.

If you approve, Sally emits `approval.resolved`.

The connected Hermes worker notices this and tells Sally to reconcile the workflow.

Important:

Hermes does not blindly continue from old memory. Sally re-checks the project/task state and queues the next safe PM step.

---

## 7. Let the agent build the first version

Once enough details are available, Sally should queue a coding/build job.

For a simple barberstore website, the agent may:

- create a local website folder
- create HTML/CSS/JS or a small Next.js/Vite site
- add homepage sections
- add services/pricing
- add contact/location section
- add mobile responsive styling
- provide preview instructions

A good agent result should include:

- what it changed
- where the files are
- how to preview it
- what still needs your approval

Example final message from the agent:

```text
Created first static version in `/path/to/barberstore-site`.
Run `npm install && npm run dev`.
Open `http://localhost:5173`.
Includes homepage, services, opening hours, contact, and booking CTA.
```

---

## 8. Preview the site

You, as the end-user, open the preview URL.

Usually something like:

```text
http://localhost:5173
```

Then you check:

- Does it look okay?
- Is the text correct?
- Are prices correct?
- Is the phone number correct?
- Does it work on mobile?
- Is anything missing?

---

## 9. Request changes in Sally

Do not tell Hermes randomly in a separate terminal if you want project continuity.

Instead, add a Sally comment or create a new task, for example:

```text
Make the design darker and more premium. Add a hero image placeholder. Change CTA text to ‘Book your cut’. Add Instagram link.
```

Then queue another PM/agent step.

Sally stays the source of truth.

---

## 10. Deployment approval

Before anything goes live, Sally/Hermes should ask for explicit approval.

Example:

```text
Approval required: deploy barberstore website to production?
```

You click:

- `Approve` only if you are ready.
- `Deny` if not.

This is intentional. Production deployment is irreversible-ish and may cost money or affect customers.

If approved, Sally queues the next bounded deployment step.

If denied, Sally stops the workflow cleanly and records why.

---

## What you need as an end-user

Minimum things you need:

1. Sally running
2. Hermes installed and working with an LLM
3. A Sally project
4. A connected Hermes worker
5. One project task that describes what you want
6. Keep the worker terminal open
7. Use Sally for approvals, blockers, and comments

What you do not need to know:

- how Next.js works
- how React works
- how git works
- how agents claim jobs
- how event streams work
- how workflow reconciliation works

Your job is only:

- describe the desired outcome
- answer questions
- approve/deny decisions
- review the result

The agent’s job is:

- translate your business request into technical steps
- build the thing
- stop when blocked
- ask before risky actions
- report evidence

Sally’s job is:

- remember the project state
- queue work
- track jobs/runs
- show blockers and approvals
- prevent stale/unsafe continuation

---

## Recommended first barberstore project prompt

Put this into your Sally project/task:

```text
Build a small modern website for my barberstore. I am not technical. Please act as my project manager first: ask for missing details, suggest the simplest implementation, then create the first version locally. I want a homepage, services/pricing, opening hours, contact/location, and booking CTA. Do not deploy anything publicly without asking for approval.
```

That last sentence is important:

```text
Do not deploy anything publicly without asking for approval.
```

---

## Expected happy path

1. You create project.
2. You create task.
3. You connect Hermes.
4. You click `Start automation`.
5. Hermes asks for missing info.
6. You answer in Sally.
7. Hermes proposes plan.
8. You approve.
9. Hermes builds local site.
10. You preview.
11. You ask for changes.
12. Hermes revises.
13. You approve deployment only when ready.

---

## Expected blocker path

If Hermes cannot continue, it should create a blocker.

Example:

```text
BLOCKER: I need the business address and phone number before I can finalize the contact section.
```

You then fill in the missing info and click `Resolve`.

Sally emits `blocker.resolved`.

Hermes worker sees it.

Sally queues the next PM step.

The work continues safely.

---

## Expected approval path

If Hermes needs a business decision:

```text
Should I use a one-page static website for v1?
```

You click `Approve`.

Sally emits `approval.resolved`.

Hermes continues through Sally reconciliation.

---

## Expected denial path

If Hermes asks:

```text
Deploy to production?
```

And you click `Deny`, the workflow stops cleanly. It does not secretly deploy.

---

## Current product gap

The main thing that still needs polishing for non-technical users is the agent connector.

The ideal UX should become:

1. Sally shows `Connect Hermes`.
2. User copies one command.
3. User pastes it into Terminal.
4. Hermes pairs automatically.
5. Worker keeps running.
6. Sally shows `Agent online`.

Right now the backend pieces exist:

- pairing code
- worker token
- heartbeat
- event polling/streaming
- job claiming
- run reporting
- approval/blocker reconciliation

But the fully idiot-proof connector command/UI still needs productization. For a developer test, the current repo worker loop is enough. For a normal barberstore owner, this should be wrapped into a clean installer/command.
