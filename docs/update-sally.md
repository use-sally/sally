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
7. apply committed Prisma migrations automatically
8. rerun bootstrap safely
9. restart the Sally services
10. verify health checks

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

## Notes

- Sally is deployed from official published container images.
- `create-sally` is the install and update operator tool around those images.
- Updating `create-sally` updates the installer tool, not the running Sally application by itself.
- Updating a running Sally instance updates the deployed Sally images.
- Hosted MCP remains the default MCP path after upgrade.
- Existing SMTP and instance settings remain in `.env`; only the managed Sally image references are updated during the normal update flow.

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
