# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in
this application. Run Git commands and integrated Docker Compose commands from
the parent monorepo root.

The running monorepo stack is the root `quick-portal` Compose project. In it,
`web` is Django, `app` is the React frontend, and `db` is PostgreSQL. First
check `docker compose ps` from the parent root. The Compose files in this
directory instead target the separate `quick-portal-api` project, which may be
stopped while the root stack is running. If Docker socket access is denied by
the sandbox, request elevated access and retry before reporting that services
are unavailable.

For the running integrated stack, use commands such as these from the parent
root:

```bash
docker compose exec -T web python manage.py showmigrations own
docker compose exec -T web python manage.py test own quickportal
docker compose exec -T web ruff check
```

## Standalone backend Compose commands

```bash
# Start all services (PostgreSQL + Django dev server)
docker compose up --build

# Run migrations
docker compose exec web python manage.py migrate

# Create superuser
docker compose exec web python manage.py createsuperuser

# Run tests
docker compose exec web python manage.py test quickportal

# Lint
docker compose exec web ruff check

# Fix lint errors
docker compose exec web ruff check --fix

# Create a new Django app
docker compose exec web python manage.py startapp <appname>
```

The Django manage.py lives at `app/manage.py`. The Docker volume mounts `./app` to `/app` in the container, so code changes are reflected immediately.

## Testing authenticated endpoints

`make dev`, run from the parent monorepo root, creates or updates a development
superuser with email `root@email.com` and password `JustTesting593!` (the dev
containers no longer create it on startup). Before testing an authenticated
endpoint, request an access token with cURL. The token endpoints require an
`Origin` from `CORS_ALLOWED_ORIGINS` and the `X-Requested-With: quick-portal`
header; the refresh token is only returned as an HttpOnly cookie:

```bash
TOKEN=$(curl --fail --silent --show-error \
  --request POST http://localhost:8080/api/token/ \
  --header 'Content-Type: application/json' \
  --header 'Origin: http://localhost:5173' \
  --header 'X-Requested-With: quick-portal' \
  --data '{"email":"root@email.com","password":"JustTesting593!"}' \
  | python -c 'import json,sys; print(json.load(sys.stdin)["access"])')
```

Use that token for every authenticated endpoint test:

```bash
curl --fail --silent --show-error \
  --header "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/cnaes/
```

## Architecture

This is a Django 5 + DRF API backend for "Quick Portal" — a portal that integrates with OWN Financial's acquiring platform. It runs in Docker with PostgreSQL 16.

**Django project structure:**

- `app/config/` — Django project settings, root URL conf, health endpoint
- `app/quickportal/` — Main app with user registration, JWT auth (email-based login), and OWN Financial API integration

**Authentication flow:**

- Users register/login with email+password (not Django's default username)
- `EmailTokenObtainPairSerializer` overrides SimpleJWT to accept email instead of username
- Usernames are auto-generated UUIDs (`user_{hex}`)
- JWT tokens (access + refresh) are issued via SimpleJWT. Login returns only
  `access`; the refresh token is set as an HttpOnly `refresh_token` cookie
  (`quickportal/services/refresh_tokens.py`). `/api/token/refresh/` rotates it
  and blacklists the old one. Each blacklist entry records its reason
  (`BlacklistedTokenReason`: rotated, logged out or revoked). Reusing a
  rotated refresh token revokes all of the user's tokens; a logged-out or
  revoked token only gets a 401. `/api/token/logout/` blacklists and clears it.
  Blacklisting happens only on a logout request that reaches the API: a logout
  that never does (offline, timed out) leaves the refresh cookie valid until it
  expires. This is an accepted gap.
  Locks are always taken user row first, then token rows: every path that
  changes a user's tokens must go through `_user_transaction`.
- Run `python manage.py flushexpiredtokens` periodically to delete expired
  outstanding and blacklisted tokens.

**OWN Financial integration (`quickportal/services/`):**

- `own_auth.py` — OAuth2 client_credentials flow to OWN's API; tokens are cached in Django's LocMemCache with TTL from the response
- `own_merchant.py` — Merchant registration against OWN's `/cadastrarConveniada` endpoint; requires a valid OWN token

**Key design decisions:**

- CORS is configured for a Vite frontend at localhost:5173
- OWN API credentials come from environment variables (OWN_CLIENT_ID, OWN_CLIENT_SECRET, OWN_SCOPE)
- OWN endpoints are protected with `IsAuthenticated` (require valid JWT)
- `owndocs/` contains reference documentation for OWN's API (not application code)

Never manually create or modify migrations. Always start by modifying the model and then letting Django auto-generate the migrations

```
# Run from the Git root against the integrated stack
docker compose exec -T web python manage.py makemigrations
```
