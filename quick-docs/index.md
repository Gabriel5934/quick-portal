---
description: Landing page for the Quick Portal documentation
layout: home

hero:
  name: Quick Monorepo Docs

features:
  - title: Quick API 🎛️
    details: Multi-purpose API serving Quick Portal
    link: /api
  - title: Beacon 📡
    details: Receive and store notifications from payment processors
    link: /beacon
  - title: Cielo 🔵
    details: Parts of Cielo Split API we use
    link: /cielo
---

<br>

# About

To start your local enviroment run `make dev`.
All env variables will be set with the exception of `TURNSTILE_SECRET`. Without it user registration fails.

## Repository boundaries

- `quick-docs/` — shared VitePress documentation
- `beacon/` - notification service
- `quick-api/` - API serving Quick Portal
- `quick-portal/` - web portal

<br>

- Run Git commands from this workspace root. The application directories are
  regular directories in this repository, not nested Git repositories.
- Keep related frontend and backend work in the same branch and PR.
- Run integrated Docker Compose commands from this Git root.
- Keep frontend and backend dependencies, builds, and deployments independent.
- Check the root `git status` before finishing.

## Integrated Docker Compose project

The root `docker-compose.dev.yml` includes the child development Compose files and
runs as the `quick-portal` project. Use it when checking the running monorepo
stack. Its services are `portal`, `storybook`, `quick-api`, `cielo-mock`,
`beacon`, and `docs` (VitePress).

```bash
# Run from this Git root
docker compose ls --all
docker compose ps
```

Running `docker compose ps` inside an application directory checks a separate
child project; an empty result there does **not** mean the
root `quick-portal` services are stopped. If a sandboxed Docker command reports
permission denied for the Docker socket, request elevated Docker access and
retry before concluding that services are unavailable. Do not print container
environment variables or credentials during diagnostics.

## Verification

Run checks in the application you changed:

- beacon - `make test-beacon`
- quick-api - `make test-api`
- quick-portal - `make test-portal`
