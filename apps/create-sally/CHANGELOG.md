# create-sally changelog

## 0.1.22

- fix updater owner/participants preflight so it does not reference `Task.owner` before that column exists
- keep live installer-managed updates working on databases that are still pre-migration for the task people rollout

## 0.1.21

- inspect and repair task owner/participants rollout drift before `prisma migrate deploy`
- refuse ambiguous partial owner/participants rollout states instead of guessing through broken drift
- keep installer-managed updates safe for the canonical task people migration

## 0.1.8

- make install and update flows inspect live Postgres migration state before deploy
- automatically reconcile missing Prisma baseline history only when the Sally schema is fully initialized
- fail explicitly on partial Sally schemas instead of guessing through broken drift states
- keep updater path on committed migrations via `prisma migrate deploy`

## 0.1.5

- add first-class `update` command for installer-managed Sally deployments
- add `doctor` command for quick deployment/tooling/health checks
- add automation-friendly CLI flags: `--dir`, `--version`, `--yes`
- add non-interactive install flags: `--mode`, `--domain`, `--workspace`, `--superadmin-email`, `--superadmin-name`, `--acme-email`, `--email-setup`, `--smtp-host`, `--smtp-port`, `--smtp-user`, `--smtp-password`, `--mail-from`
- fix generated Docker Compose files so they no longer hard-code `container_name`, allowing multiple Sally installs to coexist on the same host
- validate install/update/doctor flows on a real remote server and tighten docs around `create-sally` as the official install/update entrypoint
