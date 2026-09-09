# Quick Portal

Quick Portal is a monorepo containing three independently built applications:

| Directory | Application |
| --- | --- |
| `quick-portal-web/` | React / TypeScript frontend |
| `quick-portal-api/` | Django REST API |
| `quick-docs/` | VitePress documentation |

Run Git commands from this root. Related API and frontend changes belong in the
same branch and PR. Application commands run from their respective directories.
See `AGENTS.md` and each application's `AGENTS.md` for development conventions.

## Local development

The root `docker-compose.yml` includes both applications' development Compose
files. Configure `quick-portal-api/.env.dev` using its `.env.example`, then run:

```sh
docker compose up --build
```

The API is available at `http://localhost:8080`. The frontend Compose file uses a
dynamically allocated host port; find it with `docker compose port app 5173`.
For the standard `http://localhost:5173` frontend origin, run `npm ci` and
`npm run dev` from `quick-portal-web/` instead, with the backend development
Compose stack running. Keep CORS origins consistent with the frontend URL.

## Checks

From `quick-portal-web/`:

```sh
npm ci
npm run lint
npm test
npm run build
```

From the root, with the root development Compose stack running:

```sh
docker compose exec web ruff check
docker compose exec web python manage.py test quickportal
```

From `quick-docs/`:

```sh
npm ci
npm run docs:build
```

If running an application Compose stack separately, run its Docker commands from
that application directory with the same Compose file used to start it.

## Deployment and CI

The frontend and API retain their own Dockerfiles, Compose files, and independent
deployments. Configure each deployment's root/build context to its application
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
the entire repository. From the root, create committed source bundles with:

```sh
git archive --format=zip --output=/tmp/quick-portal-web.zip HEAD:quick-portal-web
git archive --format=zip --output=/tmp/quick-portal-api.zip HEAD:quick-portal-api
```

These archives put each application's files at the archive root. Configure the
corresponding EB application's `deploy.artifact` setting to use its archive.
Regenerate the archive after committing changes. Remote deployments have not
been changed by this migration.

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
git clone .monorepo-backup/quick-portal-web.bundle /tmp/quick-web-original
```

The monorepo has no remote yet. Create an empty destination repository, add it as
`origin`, and push `main` plus the migration tags when ready. The old remote
repositories have not been modified or archived.
