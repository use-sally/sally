# create-sally

**The official install and update tool for Sally.**

## Install Sally

```bash
npx --yes create-sally@latest
```

## Update Sally

```bash
npx --yes create-sally@latest update
```

## Check an existing install

```bash
npx --yes create-sally@latest doctor
```

Useful flags:

```bash
npx --yes create-sally@latest update --dir /opt/sally-instance --version latest --yes
npx --yes create-sally@latest doctor --dir /opt/sally-instance
npx --yes create-sally@latest install \
  --mode managed-simple \
  --dir /opt/sally-instance \
  --domain sally.example.com \
  --workspace Operations \
  --superadmin-email owner@example.com \
  --superadmin-name "Sally Admin" \
  --acme-email owner@example.com \
  --email-setup now \
  --smtp-host smtp.example.com \
  --smtp-port 587 \
  --smtp-user owner@example.com \
  --smtp-password 'secret' \
  --mail-from no-reply@example.com \
  --version latest \
  --yes
```

For a copy-paste Ubuntu / Debian walkthrough, see:
- [`../../docs/ubuntu-debian-install.md`](../../docs/ubuntu-debian-install.md)

`create-sally` is the official npm operator tool for **Sally** — the API-first project management system for teams that collaborate with humans and agents.

It is designed to keep self-hosting and updates simple, clean, and low-noise.

---

## What it does

The tool walks you through the setup or update flow and performs the deployment steps for you.

Depending on the command and mode, it can:
- check whether Docker / Docker Compose is available
- install Docker automatically on Linux if it is missing
- generate the required instance files
- verify DNS before setup
- ask for the first workspace name
- pull fresh Sally container images
- start Postgres
- apply the database schema
- bootstrap the first superadmin and first workspace
- restart the Sally services in the right order
- verify health checks
- prepare hosted Sally MCP usage
- print the final login or update summary

---

## Commands

### Install

```bash
npx --yes create-sally@latest
```

You can also call it explicitly as:

```bash
npx --yes create-sally@latest install
```

### Update

```bash
npx --yes create-sally@latest update
```

### Doctor

```bash
npx --yes create-sally@latest doctor
```

### Install automation flags

Install now also supports non-interactive provisioning flags such as:
- `--mode`
- `--dir`
- `--domain`
- `--workspace`
- `--superadmin-email`
- `--superadmin-name`
- `--acme-email`
- `--email-setup now|later`
- `--smtp-host`
- `--smtp-port`
- `--smtp-user`
- `--smtp-password`
- `--mail-from`
- `--version`
- `--yes`

When `--yes` is used for install, `create-sally` expects the required install values to be provided up front instead of prompting interactively.

Current update scope:
- supports deployments created by `create-sally`
- updates the Sally image tag in `.env`
- pulls fresh images
- applies schema changes
- reruns bootstrap safely
- restarts services
- verifies health

This is intentionally narrow for now. It is meant for installer-managed deployments, not arbitrary custom Docker setups.

---

## Install modes

## `managed-simple`

Use this if you want the easiest path.

The installer sets up:
- Docker-based deployment
- local Postgres
- HTTPS via Caddy
- Sally web + API

Best for:
- single-server installs
- fast evaluation
- production-style self-hosting without custom infra work

## `existing-infra`

Use this if you already have infrastructure and want Sally to fit into it.

Best for:
- custom reverse proxies
- existing TLS setup
- more advanced hosting environments
- teams that want more deployment control

---

## Example install flow

```bash
npx --yes create-sally@latest
```

Then the installer will ask for things like:
- install mode
- target directory
- domain
- Sally version
- first workspace name
- superadmin email
- email delivery settings

For `managed-simple`, it also checks whether your domain already points to the server before continuing.

At the end, the installer prints a clean summary like:

```text
W E L C O M E  :::::::  T O  :::::::  S A L L Y
URL: https://your-domain.example
USER: you@example.com
PASSWORD: generated-password
```

---

## Example update flow

```bash
npx --yes create-sally@latest update
```

Then the updater will:
- ask where the existing Sally install lives
- detect current mode and version
- ask for the target version
- ask for confirmation
- update image references
- run image/schema/service refresh steps
- verify health checks

At the end, it prints a clean summary like:

```text
S A L L Y  :::::::  U P D A T E D
VERSION: latest
URL: https://your-domain.example
```

---

## Why this package exists

Most self-hosted install flows are either:
- too manual for normal people
- too magical for technical users
- or too noisy for everyone

`create-sally` tries to hit the middle:
- strong defaults
- minimal unnecessary questions
- clear checks before dangerous steps
- clean output
- enough structure for production-style installs and upgrades

---

## Requirements

For a normal server install, you typically want:
- Linux server
- Docker + Docker Compose available
- a domain name
- DNS already pointed at the target server for `managed-simple`

For updates, you need:
- an existing Sally deployment created by `create-sally`
- access to the install directory
- Docker working on the target machine

---

## What gets installed and updated

The tool relies on the official Sally images:
- `ghcr.io/use-sally/sally-api`
- `ghcr.io/use-sally/sally-web`

It writes or manages instance files such as:
- `.env`
- `docker-compose.yml`
- `Caddyfile` for `managed-simple`

For MCP, the primary path is the hosted MCP endpoint inside Sally itself.

---

## Good to know

- If you use mutable tags like `latest`, the installer/updater pulls fresh images before starting services.
- For controlled production upgrades, use explicit version tags instead of relying on `latest`.
- Email setup is strongly recommended during install.
- The installer asks for `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`.
- Sally's API mailer supports those SMTP fields directly.
- You can defer email setup, but Sally will not be able to send invites, password resets, or notifications until SMTP is configured.
- Hosted MCP is now the primary path.
- After install, users create hosted MCP keys inside Sally itself and connect to the hosted `/mcp` endpoint.
- The old local `sally-mcp` path is advanced/legacy, not the primary onboarding path.

---

## About Sally

Sally is the API-first project management system we built because existing PM tools were too bloated and too hostile to automation.

Sally is built for teams that want:
- clean project management
- real APIs
- self-hosting
- human + agent collaboration
- a system they can actually adapt

Main repo:
- https://github.com/use-sally/sally

Website:
- https://usesally.com

Docs:
- https://usesally.com/docs

---

## Licensing

`create-sally` is part of the Sally project and follows the repository licensing.

See:
- `LICENSE`
- `LICENSING.md`
- https://usesally.com/docs/licensing
