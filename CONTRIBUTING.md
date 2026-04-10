# Contributing to Sally

This file defines the default Git workflow for `sally-app`.

## Branch model

### Long-lived branches
- `main`
  - always intended to stay releasable
  - production releases and version tags come from here
- `develop`
  - integration branch for upcoming work
  - feature branches should normally branch from and merge back into `develop`

If `develop` does not exist yet, create it from `main` first.

## Branch naming

Use purpose-based names, not version-based names.

### Feature branches
Format:
- `feature/<scope>`

Examples:
- `feature/collaboration`
- `feature/task-numbering`
- `feature/task-dependencies`
- `feature/workspace-owner-visibility`

### Fix branches
Format:
- `fix/<scope>`

Examples:
- `fix/status-click-behavior`
- `fix/board-filtering`
- `fix/mcp-key-creation`

### Hotfix branches
Format:
- `hotfix/<scope>`

Examples:
- `hotfix/login-regression`
- `hotfix/task-create-500`

Use `hotfix/*` only for production-critical fixes that must branch from `main`.

### Release branches (optional)
Format:
- `release/<version>`

Examples:
- `release/0.7.0`
- `release/1.0.0`

Use release branches only if a stabilization phase is needed before shipping.

## Versioning

Do not use version numbers in normal feature branch names.

Use version numbers for:
- Git tags
- GitHub releases
- package/app version fields
- changelog entries

Examples:
- `v0.7.0`
- `v1.0.0`

Rule:
- branches describe work
- tags describe versions

## Standard workflow

### 1. Sync the base branch

If working on normal feature/fix work:

```bash
git checkout develop
git pull origin develop
```

If `develop` does not exist yet:

```bash
git checkout main
git pull origin main
git checkout -b develop
git push -u origin develop
```

### 2. Create a feature branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/collaboration
git push -u origin feature/collaboration
```

### 3. Keep branches scoped

Prefer short-lived branches.

If a feature is large, use an umbrella branch plus smaller child branches.

Example:
- `feature/collaboration`
- `feature/task-collaborators`
- `feature/task-dependencies`
- `feature/workspace-owner-visibility`

### 4. Merge back into `develop`

```bash
git checkout develop
git pull origin develop
git merge --no-ff feature/task-dependencies
git push origin develop
```

Use `--no-ff` to preserve feature history clearly.

## Release flow

When `develop` is ready to ship:

```bash
git checkout main
git pull origin main
git merge --no-ff develop
git push origin main
git tag v0.1.0
git push origin v0.1.0
```

## Hotfix flow

For urgent production fixes:

### 1. Branch from `main`

```bash
git checkout main
git pull origin main
git checkout -b hotfix/login-regression
```

### 2. Merge back into both `main` and `develop`

```bash
git checkout main
git merge --no-ff hotfix/login-regression
git push origin main

git checkout develop
git pull origin develop
git merge --no-ff hotfix/login-regression
git push origin develop
```

## Practical recommendation for Sally

Default setup:
- `main`
- `develop`

For collaboration-related work:
- `feature/collaboration`

If needed, create narrower child branches under that workstream.

## Pull request guidance

- open PRs into `develop` for normal work
- open PRs into `main` only for hotfixes or planned release merges
- keep PRs scoped to one concern when possible
- prefer clear titles that match the branch intent

## Summary

Use this mental model:
- `main` = production-ready
- `develop` = next integrated state
- `feature/*` = new work
- `fix/*` = standard bug fixes
- `hotfix/*` = urgent production fixes
- tags = releases
