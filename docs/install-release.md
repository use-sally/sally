# sally_ install + first publish path

## Registry target

- `ghcr.io/use-sally/sally-api`
- `ghcr.io/use-sally/sally-web`

## Publish flow

The repo includes:
- production Dockerfiles for API and web
- GitHub Actions workflow: `.github/workflows/publish-images.yml`

Trigger options:
- push to `main`
- tag starting with `v`
- manual workflow dispatch

## First publish checklist

1. Confirm the repo is hosted under GitHub org/user with GHCR publishing rights
2. Ensure package publishing permissions are enabled for Actions
3. Run `publish-images`
4. Verify images are visible in GHCR
5. Pull the images once on a clean Linux machine to confirm access

## Installer flow

`create-sally` should eventually support:
1. prompt for install mode
2. generate secrets/config
3. write stack files
4. run `docker compose up -d`
5. run DB push
6. run bootstrap
7. verify API/web health
8. print login credentials + next steps

## Current bootstrap command

The API now has:

```bash
pnpm --filter api bootstrap:install
```

It upserts:
- initial workspace (`sally` / `sally_`)
- superadmin account
- owner membership

## Caveat

The installer is scaffolded, but full end-to-end install still depends on the published images being available first.
