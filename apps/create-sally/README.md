# create-sally

**The fastest way to install Sally.**

```bash
npx --yes create-sally@latest
```

`create-sally` is the official npm installer for **Sally** — the API-first project management system for teams that collaborate with humans and agents.

It is designed to make self-hosting Sally feel simple, clean, and low-noise.

---

## What it does

The installer walks you through the setup and then performs the deployment flow for you.

Depending on the mode, it can:
- generate the required instance files
- verify DNS before setup
- pull fresh Sally container images
- start Postgres
- apply the database schema
- bootstrap the first superadmin
- start the Sally services
- verify health checks
- print the final login details

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

## Example flow

```bash
npx --yes create-sally@latest
```

Then the installer will ask for things like:
- install mode
- target directory
- domain
- Sally version
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
- enough structure for production-style installs

---

## Requirements

For a normal server install, you typically want:
- Linux server
- Docker + Docker Compose available
- a domain name
- DNS already pointed at the target server for `managed-simple`

---

## What gets installed

The installer relies on the official Sally images:
- `ghcr.io/use-sally/sally-api`
- `ghcr.io/use-sally/sally-web`

It writes instance files such as:
- `.env`
- `docker-compose.yml`
- `Caddyfile` for `managed-simple`

---

## Good to know

- If you use mutable tags like `latest`, the installer pulls fresh images before starting services.
- Email setup is strongly recommended during install.
- You can defer email setup, but Sally will not be able to send invites, password resets, or notifications until SMTP is configured.

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
