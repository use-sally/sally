# Update Sally

Sally is updated through `create-sally`.

## Official update command

```bash
npx --yes create-sally@latest update
```

Useful automation form:

```bash
npx --yes create-sally@latest update --dir /opt/sally-instance --version latest --yes
```

Related provisioning form:

```bash
npx --yes create-sally@latest install \
  --mode managed-simple \
  --dir /opt/sally-instance \
  --domain sally.example.com \
  --workspace Operations \
  --superadmin-email owner@example.com \
  --superadmin-name "Sally Admin" \
  --acme-email owner@example.com \
  --email-setup later \
  --version latest \
  --yes
```

This is the official update path for installer-managed Sally deployments.

---

## What the updater does

The updater is designed for deployments originally created by `create-sally`.

It will:
1. detect the install directory
2. read the current Sally mode and image tag
3. ask for the target version
4. update the managed Sally image references in `.env`
5. pull the new Sally images
6. start Postgres if needed
7. inspect the live database state before migration deploy
8. if needed, reconcile missing baseline migration history for initialized databases
9. apply committed Prisma migrations automatically with `prisma migrate deploy`
10. rerun bootstrap safely
11. restart the Sally services
12. verify health checks

---

## Before you update

Recommended:
- back up Postgres
- know whether you want `latest` or a pinned version tag
- make sure you are updating a deployment created by `create-sally`

For production installs, pinned version tags are safer than `latest`.

Examples:

```bash
npx --yes create-sally@latest update
```

Then enter:
- `latest` for the newest published release path
- or a specific Sally image tag if you want a controlled upgrade

---

## Current scope

The update flow currently supports:
- `managed-simple` installs created by `create-sally`
- `existing-infra` installs created by `create-sally`

It does **not** try to manage arbitrary hand-edited or fully custom Docker deployments.

That limitation is intentional.

---

## Missing `_prisma_migrations` recovery

The updater now includes a recovery path for a specific broken-but-common state:
- the Sally schema is already initialized
- core tables like `Workspace`, `Project`, `TaskStatus`, and `Task` exist
- but `_prisma_migrations` does not exist, so Prisma has no baseline history recorded

When that happens, the updater:
1. checks Postgres directly through `docker compose exec postgres psql`
2. confirms whether the schema looks initialized
3. marks `20260410182000_init` as applied
4. runs `prisma migrate deploy` for the remaining migrations

This is designed to let official installer-managed updates recover safely instead of failing during migration deploy.

Important boundaries:
- this recovery is for installer-managed Sally deployments only
- it is not a generic repair tool for arbitrary custom schemas
- if the schema is only partially initialized, the updater will not fake the baseline

---

## Notes

- Sally is deployed from official published container images.
- `create-sally` is the install and update operator tool around those images.
- Updating `create-sally` updates the installer tool, not the running Sally application by itself.
- Updating a running Sally instance updates the deployed Sally images.
- Hosted MCP remains the default MCP path after upgrade.
- Existing SMTP and instance settings remain in `.env`; only the managed Sally image references are updated during the normal update flow.
- The updater now relies on committed Prisma migrations rather than schema push semantics.

---

## Product changes relevant to this update

This update line also carries application-level changes that affect live behavior after upgrade:

### Workflow/status changes
- `BLOCKED` is now a first-class task status type
- default project workflows now include: Backlog, In Progress, Blocked, Review, Done

### Task ordering changes
- `Task.number` remains the stable human-facing task reference
- `Task.position` is now the canonical mutable project-wide order
- list and board views consume persisted `position` ordering

### New reorder capabilities
- project statuses can be reordered while keeping the first status pinned
- tasks can be reordered within a board column
- tasks can also be reordered across the whole project without changing status

Relevant interfaces:
- API: `POST /projects/:projectId/tasks/reorder`
- MCP: `project.tasks.reorder`

---

## If you want predictable production upgrades

Prefer explicit version tags over `latest`.

That gives you:
- clearer rollback points
- more predictable validation
- better release discipline

Recommended team model:
- use `latest` for fast evaluation
- use pinned tags for production
