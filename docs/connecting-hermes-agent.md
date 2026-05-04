# Connecting Hermes to Sally

This is the standard connection path for Sally agent runtimes. Hermes is the first supported runtime.

Hermes does not need built-in Sally support. Sally supplies the connector. The connector pairs the user's machine with Sally, stores a local worker token, listens for Sally jobs, and invokes the local `hermes` CLI when work arrives.

## User flow

1. User installs/authenticates Hermes normally.
2. In Sally, user clicks `Connect agent` → `Hermes`.
3. Sally shows a one-line command with a one-time pairing code.
4. User runs that command on the machine where Hermes is installed.
5. The connector exchanges the pairing code for a worker token and starts the worker loop.

Pairing codes and worker tokens are credentials. Do not paste them into logs, docs, commits, or chat transcripts.

## Public command, Option A

This is the command Sally should show to normal users:

```bash
npx sally-agent-connect hermes --pairing-code <PAIRING_CODE>
```

Recommended explicit form:

```bash
npx sally-agent-connect hermes \
  --pairing-code <PAIRING_CODE> \
  --base-url https://<your-sally-api> \
  --workspace-id <WORKSPACE_ID> \
  --workspace-slug <WORKSPACE_SLUG> \
  --name hermes-local-worker
```

For local Sally development, the API URL is usually `http://localhost:4000`:

```bash
npx sally-agent-connect hermes \
  --pairing-code <PAIRING_CODE> \
  --base-url http://localhost:4000 \
  --workspace-id <WORKSPACE_ID> \
  --workspace-slug release-validation
```

After first pairing, the command can be run without `--pairing-code` because the worker token is stored locally:

```bash
npx sally-agent-connect hermes --base-url http://localhost:4000 --workspace-slug release-validation
```

## Developer command inside this repo

The repo-local dev shortcut remains available:

```bash
pnpm connect:hermes -- --pairing-code <PAIRING_CODE>
```

The public package wrapper can also be exercised locally:

```bash
pnpm --filter sally-agent-connect exec tsx src/cli.ts hermes --pairing-code <PAIRING_CODE>
```

## Defaults

- API base URL: `http://localhost:4000`
- workspace slug: `release-validation`
- worker name: `hermes-local-worker`
- token file: `~/.sally/hermes-worker-token`
- cursor file: `~/.sally/hermes-worker-cursor`
- Hermes command: `hermes`
- runtime timeout: `1800000` ms
- capabilities: `pm,architecture,planning,code,git,tools`

## One-shot verification

Run a single worker iteration and exit:

```bash
npx sally-agent-connect hermes --once --base-url http://localhost:4000 --workspace-slug release-validation
```

## Override flags

```text
hermes
--pairing-code <code>
--base-url <url>
--workspace-id <id>
--workspace-slug <slug>
--token-file <path>
--cursor-file <path>
--name <worker-name>
--hermes-command <command>
--hermes-profile <profile>
--capabilities <comma-separated-list>
--timeout-ms <milliseconds>
--once
```

## Security model

- Sally stores only the worker token hash.
- The connector stores the raw worker token only on the agent machine.
- The connector prints `[REDACTED]` instead of the worker token.
- Runtime prompts reference Sally auth through environment variables, not raw token values.
- Revoking the connected runtime in Sally deletes the connection row and token hash.

## Runtime behavior

The connector sets:

```text
SALLY_API_BASE_URL
SALLY_API_KEY
SALLY_WORKSPACE_ID
SALLY_WORKSPACE_SLUG
SALLY_WORKER_CURSOR_FILE
SALLY_RUNTIME_CONFIG
SALLY_WORKER_NAME
```

`SALLY_RUNTIME_CONFIG` enables Hermes with role/capability routing. Sally's runtime adapter injects Hermes quiet mode when it executes jobs, so automation run summaries should not include Hermes CLI banner noise.

## Package implementation

`sally-agent-connect` is a standalone workspace package with binaries:

```text
sally-agent-connect
sally-agent
```

The public Sally UI should display the `npx sally-agent-connect hermes ...` command, not repo-local `pnpm` commands. The repo-local `pnpm connect:hermes` shortcut remains only for developers working inside the Sally monorepo.
