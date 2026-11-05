# Quick Portal

Quick Portal is a monorepo containing independently built applications:

| Directory | Application |
| --- | --- |
| `quick-docs/` | VitePress documentation |

Run Git commands from this root. Related API and frontend changes belong in the
same branch and PR. Application commands run from their respective directories.
See `AGENTS.md` and each application's `AGENTS.md` for development conventions.

## Local development

The root `docker-compose.dev.yml` includes the applications' development
Compose files. Run:

```sh
make dev
```

`make dev` creates the untracked root `.env` from `.env.example` when it is
missing (it sets `COMPOSE_FILE=docker-compose.dev.yml`), fills the root
`.env.portal`, `.env.beacon` and `.env.cielo-mock`, then runs
`docker compose -f docker-compose.dev.yml up --build --detach --wait`.

Documentation is available at `http://localhost:5174` with live reload.
Run `docker compose -f docker-compose.dev.yml up docs` to start only the
documentation service.

## Checks

From `quick-docs/`:

```sh
npm ci
npm run docs:build
```

If running an application Compose stack separately, run its Docker commands from
that application directory with the same Compose file used to start it.

## Deployment and CI

Each application keeps its own Dockerfile, Compose file, and independent
deployment. Configure each deployment's root/build context to its application
directory. Keep environment variables in the deployment service or local ignored
files. No shared Node workspace or build orchestrator is required.

There were no tracked GitHub Actions workflows to migrate. When adding CI, use
application-specific working directories and path filters, including shared root
configuration where relevant. Documentation checks should target `quick-docs/`.
The CodeRabbit configuration now lives at the repository root and scopes Python
review guidance to the backend.

The existing local Elastic Beanstalk configuration files remain ignored in each
application directory. Before using EB CLI deployment from this monorepo,
configure an application-only deployment artifact; Git-based packaging may select
the entire repository. Remote deployments have not been changed by this
migration.

## Migration and recovery

Both original `main` histories were imported without squashing, including local
commits that had not been pushed. Original commit IDs remain reachable. Tags
`migration/quick-portal-web` and `migration/quick-portal-api` identify the imported
tips. Older commits use the original repository-relative paths, so inspect a
migration tag directly when browsing pre-migration history.

Local `.monorepo-backup/` contains complete Git bundles, original Git directories,
the previous root instructions, and a migration manifest. It is ignored and must
not be committed. Keep a separate durable copy before removing that folder.
To inspect an original repository independently, clone its bundle, for example:

```sh
git clone .monorepo-backup/<application>.bundle /tmp/<application>-original
```

The monorepo has no remote yet. Create an empty destination repository, add it as
`origin`, and push `main` plus the migration tags when ready. The old remote
repositories have not been modified or archived.
