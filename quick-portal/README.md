# Quick Portal

Frontend for [Quick API](../quick-docs/quick-api/index.md) (`../quick-api`): sign in, list your
Cielo sellers and onboard new ones. Built from the
[Mantine TanStack Start template](https://github.com/Mantinedev/Mantine-tanstack-start-template)
(TanStack Start, Mantine, Vite+, Storybook), converted from Yarn to npm.

Run every command from this directory.

## Development

```bash
npm install
npm run dev   # http://localhost:3000
```

Quick API must be running (`make dev` from the monorepo root serves it at
`http://localhost:8100`), which is the default, so no environment setup is needed. To point
elsewhere, set the `QUICK_API_URL` environment variable for the server process, e.g.
`QUICK_API_URL=https://api.example.com npm run dev`. Both compose files set it to
`http://quick-api:8000` themselves.

`.npmrc` sets `legacy-peer-deps`: Storybook 10 declares an optional peer on `vite-plus@^0.2`
while the template uses Vite+ 1.0.

## Deployment

`docker-compose.yml` is the build-environment compose (sandbox and production). It runs the
`production` image behind Caddy, which serves `PORTAL_HOST` over HTTPS
(`quick-portal-sandbox.duckdns.org`, set on the `caddy` service in `docker-compose.yml`), and
includes `../quick-api/docker-compose.yml` so Quick API runs on the same network without a
published port. Create `../quick-api/.env`, then from the monorepo root:

```bash
docker compose -f quick-portal/docker-compose.yml up --build --detach
```

## Routes

| Path              | Access        | Page                                                         |
| ----------------- | ------------- | ------------------------------------------------------------ |
| `/`               | public        | Login; redirects to `/inicio` when already signed in         |
| `/inicio`         | authenticated | Cielo sellers table, loaded by the route loader (SSR)        |
| `/cadastro-cielo` | authenticated | Seller onboarding form (`POST /cielo/onboard`)               |

Authenticated routes live under the pathless `src/routes/_auth.tsx` layout. Route files only wire
loaders; page components live in `src/pages/` next to their Storybook stories.

## Auth and data flow

- All Quick API calls are TanStack Start server functions (`src/server/quick-api.ts`), so the
  browser never calls Quick API directly and CORS is not involved.
- Login captures Quick API's refresh cookie and re-issues it as this app's own HttpOnly
  `quick_portal_refresh` cookie. During SSR the server exchanges it for an access token
  (`POST /auth/refresh`), so authenticated pages render on the server.
- The access token lives only in the TanStack Query cache (`['auth', 'session']`) and is passed
  to each server function. `getAccessToken` refreshes it shortly before it expires.
- Every request has its own hook in `src/hooks/` (`useLogin`, `useLogout`, `useSession`, `useMe`,
  `useSellers`, `useOnboardSeller`, `useCep`).

## Scripts

- `dev`, `build`, `preview`: development server, production build, preview of the build
- `typecheck`, `lint` (oxlint + stylelint), `format:write`, `check` (format, lint and types)
- `vitest`: unit tests
- `storybook`, `storybook:build`: every route has a story file rendered at four viewports
  (mobile 375×812, tablet portrait 768×1024, tablet landscape 1024×768, desktop 1440×900).
  Storybook replaces `src/server/quick-api.ts` with `.storybook/mocks/quick-api.ts`.
