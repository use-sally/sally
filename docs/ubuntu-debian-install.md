# Sally install tutorial for Ubuntu / Debian

This is the simplest end-to-end path for installing Sally on a fresh Ubuntu or Debian server.

It is written to be easy to copy and paste.

---

## What this guide does

It will:
- install Node.js
- run the Sally installer
- let Sally install Docker automatically if needed
- set up the web app, API, database, and HTTPS
- prepare hosted Sally MCP usage

This guide assumes you want the easiest path:
- **managed-simple**

---

## Before you start

You need:
- an Ubuntu or Debian server
- a domain name already pointed to that server
- root access or a user that can use `sudo`
- your SMTP credentials if you want invite/reset emails to work immediately

Example domain used below:
- `projects.example.com`

Replace that with your real domain.

---

## 1. Connect to the server

```bash
ssh root@your-server-ip
```

If you are not root, use a sudo-capable user instead.

---

## 2. Install Node.js

Run this exactly:

```bash
apt update && apt install -y curl ca-certificates gnupg && \
mkdir -p /etc/apt/keyrings && \
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
apt update && apt install -y nodejs
```

Check it:

```bash
node -v
npm -v
npx -v
```

---

## 3. Make sure your domain points to the server

Check the server IP:

```bash
curl -4 ifconfig.me
```

Check the domain:

```bash
dig +short projects.example.com
```

The domain must resolve to the server IP.

If it does not, stop here and fix DNS first.

---

## 4. Run the Sally installer

Use:

```bash
npx --yes create-sally@latest
```

---

## 5. What to select in the installer

When the installer asks questions, choose/fill these values.

### Install mode

Choose:
- `managed-simple — sally_ sets up Docker + Postgres + HTTPS`

### Where should the installer write the instance files?

Press Enter to accept the default:

```text
/opt/sally-instance
```

### Domain for this sally_ instance

Enter your real domain, for example:

```text
projects.example.com
```

The installer will check that the domain already points to this server.

### Sally version

For normal use, enter:

```text
latest
```

### First workspace name

Example:

```text
Operations
```

Or your real workspace name, such as:
- `AutomateThis`
- `Kraftfabrik`
- `Client Ops`

### Superadmin email

Enter the email of the first admin user.

Example:

```text
you@example.com
```

### Superadmin name

Example:

```text
Alex Hammerschmied
```

### ACME / TLS contact email

Usually use the same admin email.

Example:

```text
you@example.com
```

### Email setup choice

Recommended:
- `Configure email now (recommended)`

If you skip this, Sally will install, but invites, password resets, and other emails will not work until you configure SMTP later.

### SMTP settings

Enter your real SMTP credentials.

Example for Amazon SES on port 587:

```text
SMTP host: email-smtp.eu-west-1.amazonaws.com
SMTP port: 587
SMTP username: YOUR_SMTP_USERNAME
SMTP password: YOUR_SMTP_PASSWORD
MAIL_FROM address: sally@yourdomain.com
```

The installer now writes the SMTP config in the format the Sally API mailer expects.

---

## 6. Wait for the installer to finish

The installer will automatically:
- install Docker if needed
- pull the latest Sally images
- start Postgres
- apply the database schema
- bootstrap the first superadmin and workspace
- start the web app + API + HTTPS
- prepare hosted Sally MCP usage

At the end you will see a welcome block like this:

```text
W E L C O M E  :::::::  T O  :::::::  S A L L Y
URL: https://projects.example.com
USER: you@example.com
PASSWORD: generated-password
```

Save that password.

---

## 7. Log in

Open your Sally URL in the browser:

```text
https://projects.example.com
```

Log in with:
- the superadmin email you entered
- the generated password shown at the end of install

---

## 8. Test email delivery

After login:
- create or invite a test team member
- confirm that the invite email sends successfully

If invite creation works but email fails, check:
- SMTP host
- SMTP port
- SMTP username
- SMTP password
- `MAIL_FROM`

---

## 9. MCP setup after install

The installer now writes a short hosted-MCP note inside:

```bash
/opt/sally-instance/mcp
```

See what was created:

```bash
ls -la /opt/sally-instance/mcp
```

You should see files like:
- `.env.example`
- `run-mcp.sh`
- `openclaw.example.json`
- `MCP_SETUP.txt`

Important:
- the installer does **not** create an MCP user key for you
- each user should mint their own API key inside Sally later

### To use MCP

1. log into Sally
2. create a personal API key
3. copy the MCP env file:

```bash
cd /opt/sally-instance/mcp
cp .env.example .env
nano .env
```

4. put your own key into:

```text
SALLY_USER_API_KEY=...
```

5. start the MCP server:

```bash
cd /opt/sally-instance/mcp
./run-mcp.sh
```

Optional advanced restriction:
- if you want one MCP server pinned to one workspace, set:

```text
SALLY_WORKSPACE_SLUG=your-workspace-slug
```

---

## 10. Useful checks

### Check containers

```bash
cd /opt/sally-instance
docker compose ps
```

### Check API logs

```bash
cd /opt/sally-instance
docker compose logs --tail=100 api
```

### Check web logs

```bash
cd /opt/sally-instance
docker compose logs --tail=100 web
```

### Check Caddy logs

```bash
cd /opt/sally-instance
docker compose logs --tail=100 caddy
```

### Check health endpoint

```bash
curl -I https://projects.example.com/api/health
```

---

## 11. Fast reinstall / cleanup

If you want to remove the current install and try again:

```bash
cd /opt/sally-instance && docker compose down -v
rm -rf /opt/sally-instance
```

---

## 12. Short version

If you already have Node installed and DNS is correct, the shortest path is:

```bash
npx --yes create-sally@latest
```

Then choose:
- `managed-simple`
- `/opt/sally-instance`
- your domain
- `latest`
- your workspace name
- your admin email/name
- your SMTP settings

And wait for the welcome screen.
