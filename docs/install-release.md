# sally_ install + publish path

## Product model

Sally is deployed from official published container images.

`create-sally` is the official operator tool for:
- fresh installs
- guided updates

Public commands:

Install:
```bash
npx --yes create-sally@latest
```

Non-interactive install:
```bash
npx --yes create-sally@latest install --mode managed-simple --dir /opt/sally-instance --domain sally.example.com --workspace Operations --superadmin-email owner@example.com --superadmin-name "Sally Admin" --acme-email owner@example.com --email-setup later --version latest --yes
```

Update:
```bash
npx --yes create-sally@latest update
```

---

## Published artifacts

Container images:
- `ghcr.io/use-sally/sally-api`
- `ghcr.io/use-sally/sally-web`

npm packages:
- `create-sally`
- `sally-mcp`

---

## Version model

Sally has separate version tracks for different artifacts.

- `create-sally` has its own npm package version and release cycle.
- The Sally application itself has its own release/version lifecycle.
- Updating `create-sally` updates the installer/operator tool.
- Updating a running Sally instance updates the deployed Sally images.

This distinction is intentional and should stay explicit in docs, release notes, and support responses.

---

## GitHub publish flow

The repo includes:
- production Dockerfiles for API and web
- GitHub Actions workflow: `.github/workflows/publish-images.yml`

Trigger options:
- push to `main`
- tag starting with `v`
- manual workflow dispatch

Image builds stamp version metadata automatically from the repo:
- version from root `package.json`
- full git SHA for API/runtime metadata
- short git SHA for web display metadata
- UTC build timestamp

That means deployed Sally images should know their version without asking end users to set manual version env vars.

---

## Current create-sally behavior

`create-sally` now supports:
1. Docker / Docker Compose preflight
2. automatic Docker install on Linux if missing
3. install mode selection
4. domain prompt
5. immediate DNS verification for `managed-simple`
6. first workspace naming
7. SMTP prompt flow using `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `MAIL_FROM`
8. stack file generation
9. fresh image pull before startup
10. Postgres startup + readiness wait
11. Prisma DB push
12. bootstrap of first workspace + superadmin
13. health verification
14. final welcome output with login details
15. post-install path points users toward hosted MCP inside Sally
16. guided update flow for installer-managed Sally deployments
17. update-time image tag refresh in `.env`
18. update-time image pull + migration deploy + service restart + health verification

---

## Update model

The official update path is:

```bash
npx --yes create-sally@latest update
```

Current scope:
- supports deployments created by `create-sally`
- supports both `managed-simple` and `existing-infra`
- updates the managed Sally image references in `.env`
- pulls fresh images
- reapplies schema changes
- reruns bootstrap safely
- restarts services
- verifies health

This is intentionally narrower than trying to manage arbitrary custom Docker setups.

---

## Mailer behavior

The API mailer supports:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `MAIL_FROM`
- `APP_BASE_URL`

`SMTP_URL` is still supported as a compatibility fallback, but the preferred model is the discrete SMTP fields above.

---

## MCP behavior

The primary MCP product path is now hosted MCP inside Sally.

Hosted MCP endpoint:
- `/mcp`

Hosted MCP auth model:
- users create hosted MCP keys inside Sally
- each key is tied to the Sally user who created it
- permissions are inherited from that user
- optional workspace restriction exists at the hosted MCP key level

Local/stdio MCP:
- `sally-mcp` still exists as an advanced / legacy path
- it is no longer the default onboarding path

---

## Bootstrap result

The bootstrap step upserts:
- first workspace (installer-provided name + derived slug)
- superadmin account
- owner membership

The same bootstrap step is rerun during managed updates so installer-managed instances stay aligned with the expected bootstrap state.

---

## Release checklist

1. Push to `main`
2. Confirm `publish-images` succeeds
3. Publish `sally-mcp` only when the advanced/legacy stdio path changes are ready
4. Publish `create-sally` when installer changes are ready
5. Test one fresh `managed-simple` install on a clean Linux host
6. Test one fresh `existing-infra` install on a clean Linux host
7. Test one `create-sally update` run against an installer-managed deployment
8. Verify SMTP, login, invite flow, hosted MCP key UX, and hosted `/mcp` behavior
9. Verify reported Sally version after update matches the deployed image tag
