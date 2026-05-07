# Sally local development setup

This guide is for engineers who want to run the Sally app from source on their own machine.

It starts a local Postgres database, runs Prisma migrations, creates a local superadmin account, and starts:

- API: http://localhost:4000
- Web: http://localhost:3000

Do not use production secrets in local development. The values below are local-only throwaway values.

---

## 1. Requirements

Install these first:

- Git
- Docker Desktop, or another Docker engine with Docker Compose support
- Node.js 22 or newer
- Corepack, usually included with Node.js
- pnpm 10.6.5, managed by Corepack

Check your versions:

```bash
git --version
docker --version
docker compose version
node --version
corepack --version
```

Enable pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.6.5 --activate
pnpm --version
```

Expected pnpm version:

```text
10.6.5
```

---

## 2. Clone the repo

Use SSH if your GitHub access is set up:

```bash
git clone git@github.com:use-sally/sally.git sally-app
cd sally-app
```

Or HTTPS:

```bash
git clone https://github.com/use-sally/sally.git sally-app
cd sally-app
```

Install dependencies:

```bash
pnpm install
```

---

## 3. Start local Postgres

Sally's local compose file starts only Postgres.

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

Verify it is running:

```bash
docker ps --filter name=sally-postgres
```

If port 5432 is already used, stop the other local Postgres instance or change the exposed port in `infra/docker-compose.yml` and update the `DATABASE_URL` values below.

---

## 4. Create local env files

Create the database env file:

```bash
cp packages/db/.env.example packages/db/.env
```

Edit `packages/db/.env` so it contains this local-only value:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sally?schema=public"
```

Create the API env file:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` so it contains at least:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sally?schema=public
APP_BASE_URL=http://localhost:3000
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_NAME=Local Admin
BOOTSTRAP_SUPERADMIN_PASSWORD=ChangeMe123!
SUPERADMIN_DISABLE_PASSWORD_RESET=true
API_TOKEN=
MAIL_FROM=
SMTP_URL=
```

Notes:

- `BOOTSTRAP_SUPERADMIN_PASSWORD` is used only by the bootstrap command to create the initial local superadmin password.
- Keep this local password private, but do not reuse a real password here.
- Mail is optional for normal local development. With `MAIL_FROM` and `SMTP_URL` blank, invite/reset email sending will report that mail is not configured.

Create the web env file:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local` so it contains:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_API_TOKEN=
NEXT_PUBLIC_WORKSPACE_ID=
# NEXT_PUBLIC_WORKSPACE_SLUG=
```

Do not commit `.env`, `.env.local`, real API tokens, SMTP credentials, or production database URLs.

---

## 5. Run database migrations and generate Prisma Client

From the repo root:

```bash
pnpm --filter @sally/db exec prisma generate --schema prisma/schema.prisma
pnpm --filter @sally/db exec prisma migrate deploy --schema prisma/schema.prisma
```

For day-to-day development, use `migrate deploy` to apply existing migrations.

Only use `prisma migrate dev --name <migration_name>` when you intentionally changed `packages/db/prisma/schema.prisma` and need to create a new migration.

---

## 6. Bootstrap a local superadmin and workspace

From the repo root:

```bash
pnpm --filter api bootstrap:install
```

This creates or updates:

- local superadmin account: `admin@example.com`
- local password: `ChangeMe123!`
- default workspace slug: `sally`

If you changed `SUPERADMIN_EMAIL`, `SUPERADMIN_NAME`, `BOOTSTRAP_SUPERADMIN_PASSWORD`, `SALLY_WORKSPACE_NAME`, or `SALLY_WORKSPACE_SLUG` in `apps/api/.env`, use your values instead.

---

## 7. Start the API

Open terminal 1:

```bash
pnpm --filter api dev
```

Verify the API from another terminal:

```bash
curl -fsS http://localhost:4000/health
```

Expected response is JSON with `ok: true`.

---

## 8. Start the web app

Open terminal 2:

```bash
pnpm --filter web dev
```

Open:

```text
http://localhost:3000
```

Log in with the local bootstrap account:

```text
Email: admin@example.com
Password: ChangeMe123!
```

---

## 9. Recommended developer workflow

Before starting work:

```bash
git status --short --branch
git fetch origin
```

Create a feature branch:

```bash
git checkout -b feature/short-description origin/main
```

If your work depends on another active branch, branch from that branch instead:

```bash
git checkout -b feature/my-change origin/feature/base-branch
```

Run focused tests while working. Examples:

```bash
pnpm --filter api test -- team-admin-hub.test.ts
pnpm --filter web test -- lib/team-admin-hub.test.ts
```

Before opening a PR, run the full local validation set:

```bash
pnpm --filter @sally/db exec prisma generate --schema prisma/schema.prisma
pnpm --filter create-sally test
pnpm --filter create-sally build
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
pnpm --filter api build
pnpm --filter api test
git diff --check
```

Known current lint state may include warnings. Do not introduce new errors.

---

## 10. Repo structure quick map

```text
apps/web          Next.js web app, runs on localhost:3000
apps/api          Fastify API and hosted MCP endpoint, runs on localhost:4000
apps/create-sally Installer/update package
apps/mcp          Parked local stdio MCP package
packages/db       Prisma schema, migrations, generated Prisma client
packages/types    Shared TypeScript types
docs              Product, API, install, and developer docs
infra             Local and deployment infrastructure files
```

Common files you will touch:

```text
apps/web/app/...                 Next app routes/pages
apps/web/components/...          React components
apps/web/lib/api.ts              Web API client helpers
apps/api/src/index.ts            API routes
apps/api/src/*.test.ts           API regression tests
apps/web/lib/*.test.ts           Web/source regression tests
packages/db/prisma/schema.prisma Prisma schema
packages/db/prisma/migrations    Database migrations
```

---

## 11. Resetting local data

This deletes the local Sally database volume. Only do this if you are okay losing local data.

Stop Postgres and remove the volume:

```bash
docker compose -f infra/docker-compose.yml down -v
```

Start fresh:

```bash
docker compose -f infra/docker-compose.yml up -d postgres
pnpm --filter @sally/db exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter api bootstrap:install
```

Then restart API and web dev servers.

---

## 12. Troubleshooting

### API cannot connect to database

Check Postgres is running:

```bash
docker ps --filter name=sally-postgres
```

Check port 5432:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN || true
```

Verify `DATABASE_URL` in both files if needed:

```text
packages/db/.env
apps/api/.env
```

For the default compose setup, it should be:

```text
postgresql://postgres:postgres@localhost:5432/sally?schema=public
```

### Web login posts to the wrong place

If login shows a raw HTML 404 page or the browser posts to `http://localhost:3000/api/auth/login`, check:

```text
apps/web/.env.local
```

It must include:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

Restart the web dev server after changing `.env.local`.

### Prisma Client looks stale

Run:

```bash
pnpm --filter @sally/db exec prisma generate --schema prisma/schema.prisma
```

Restart API after generation.

### Port 3000 or 4000 is already in use

Inspect listeners:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN || true
lsof -nP -iTCP:4000 -sTCP:LISTEN || true
```

Stop the process/container using the port, or run the dev server on a different port and update env accordingly.

### Need to test Docker images locally

Normal development uses `pnpm --filter api dev` and `pnpm --filter web dev`.

Use Docker image rebuilds only when validating container behavior, production-like startup, or baked-in Next.js env values.

Important: `NEXT_PUBLIC_*` values are baked into the web image at build time. If testing the web Docker image, pass `NEXT_PUBLIC_API_BASE_URL` as a build arg, not only as a runtime env var.

---

## 13. What not to do

- Do not commit `.env`, `.env.local`, SMTP credentials, API tokens, or real database URLs.
- Do not use production data in local development.
- Do not create Prisma migrations unless you intentionally changed the schema.
- Do not put platform-role governance into Project People or Task People. Instance-wide account administration belongs in the Team section.
- Do not declare work ready without running focused tests and the relevant validation commands.
