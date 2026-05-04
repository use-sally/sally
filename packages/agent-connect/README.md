# sally-agent-connect

Public Sally connector CLI for local agent runtimes.

Hermes does not need built-in Sally support. This package is the bridge: it pairs the local machine with Sally, stores a worker token, listens for Sally jobs, and invokes the local Hermes CLI.

## First-time Hermes connection

```bash
npx sally-agent-connect hermes --pairing-code <PAIRING_CODE>
```

Common explicit form:

```bash
npx sally-agent-connect hermes \
  --pairing-code <PAIRING_CODE> \
  --base-url http://localhost:4000 \
  --workspace-id <WORKSPACE_ID> \
  --workspace-slug release-validation \
  --name hermes-local-worker
```

## After first pairing

```bash
npx sally-agent-connect hermes --base-url http://localhost:4000 --workspace-slug release-validation
```

## One-shot verification

```bash
npx sally-agent-connect hermes --once --base-url http://localhost:4000 --workspace-slug release-validation
```

## Local files

- token: `~/.sally/hermes-worker-token`
- cursor: `~/.sally/hermes-worker-cursor`

The worker token is a credential and must not be printed or committed.
