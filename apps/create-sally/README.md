# create-sally

Interactive one-line installer scaffold for `sally_`.

## Goal

Provide a single entry command:

```bash
npx create-sally@latest
```

Then guide the user into one of two install modes:
- `managed-simple`
- `existing-infra`

## Current status

Implemented:
- mode selection prompt
- secret generation
- `.env` generation
- `docker-compose.yml` generation
- `Caddyfile` generation for managed-simple
- installer execution flow scaffold:
  - `docker compose up -d`
  - Prisma `db push`
  - bootstrap command
  - health checks

Installer defaults:
- image registry namespace: `ghcr.io/use-sally`
- database name: `sally`
- workspace slug: `sally`

## Important dependency

The full installer path assumes the published images already exist:
- `ghcr.io/use-sally/sally-api`
- `ghcr.io/use-sally/sally-web`

## First real release checklist

1. Push repo to GitHub under the `use-sally` org
2. Ensure GitHub Actions can publish packages to GHCR
3. Run the `publish-images` workflow
4. Confirm the two images exist in GHCR
5. Test one managed-simple install on a clean Linux host
6. Test one existing-infra install on a clean Linux host
7. Fix any bootstrap / health / reverse-proxy issues found in those tests

## Intended next improvements

- better Docker preflight checks
- SMTP connection test during install
- first-run verification output
- nicer recovery / rollback messaging
- production-ready bootstrap command integration
