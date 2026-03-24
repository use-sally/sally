# Authentication + workspace selection

## Current approach (MVP)
- **Session login**: web app uses `/auth/login` to create a session token and stores it locally.
- **API token**: still supported for bootstrap/testing (`Authorization: Bearer <token>` or `X-Api-Key`).
- **Workspace separation**: requests include `X-Workspace-Id` or `X-Workspace-Slug`.
- If there is **exactly one workspace**, the API auto-selects it and headers are optional.

## Configure locally

### API
- Copy `apps/api/.env.example` to `apps/api/.env`.
- Set `API_TOKEN` (optional). If unset, auth is disabled.

### Web
- Copy `apps/web/.env.example` to `apps/web/.env.local`.
- `NEXT_PUBLIC_API_TOKEN` is optional now (session login is preferred).
- Set either `NEXT_PUBLIC_WORKSPACE_ID` or `NEXT_PUBLIC_WORKSPACE_SLUG` if you want a fixed workspace for local testing.

## Auth sessions (now available)
- **Login**: `POST /auth/login` with `{ email, name? }` returns `{ sessionToken, account, memberships }`.
- **Session header**: send `Authorization: Bearer <sessionToken>` (or `X-Session-Token`) on API requests.
- **Logout**: `POST /auth/logout` (requires session).
- **Me**: `GET /auth/me` (requires session).
- Session TTL defaults to 30 days (configure via `SESSION_TTL_DAYS`).

## Workspace resolution
- When authenticated, workspace access is validated against membership.
- If multiple memberships exist, provide `X-Workspace-Id` or `X-Workspace-Slug`.

## Permissions
- **Owner/Admin** required for sensitive actions: membership management, project archive/delete, and status settings.
- API token requests bypass role checks (full access).

## Workspace selection UI
- Workspace selector is available in the app shell header.
- Selecting a workspace updates local storage and reloads to refresh data.
