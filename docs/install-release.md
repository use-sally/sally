# sally_ install + publish path

## Published artifacts

Container images:
- `ghcr.io/use-sally/sally-api`
- `ghcr.io/use-sally/sally-web`

npm packages:
- `create-sally`
- `sally-mcp`

## GitHub publish flow

The repo includes:
- production Dockerfiles for API and web
- GitHub Actions workflow: `.github/workflows/publish-images.yml`

Trigger options:
- push to `main`
- tag starting with `v`
- manual workflow dispatch

## Current installer behavior

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
14. automatic `sally-mcp` install + scaffold generation
15. final welcome output with login details

## Mailer behavior

The API mailer supports:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `MAIL_FROM`
- `APP_BASE_URL`

`SMTP_URL` is still supported as a compatibility fallback, but the preferred model is the discrete SMTP fields above.

## MCP behavior

The MCP package is:
- `sally-mcp`

Public MCP setup expects:
- `SALLY_URL`
- `SALLY_USER_API_KEY`

Optional advanced restriction:
- `SALLY_WORKSPACE_SLUG`

Installer behavior:
- `create-sally` installs/scaffolds `sally-mcp`
- it does **not** mint or configure a user API key
- each Sally user creates their own API key later and uses it in their own MCP client config

## Bootstrap result

The bootstrap step upserts:
- first workspace (installer-provided name + derived slug)
- superadmin account
- owner membership

## Release checklist

1. Push to `main`
2. Confirm `publish-images` succeeds
3. Publish `sally-mcp` when MCP changes are ready
4. Publish `create-sally` when installer changes are ready
5. Test one fresh managed-simple install on a clean Linux host
6. Test one fresh existing-infra install on a clean Linux host
7. Verify SMTP, login, invite flow, and MCP scaffold generation
