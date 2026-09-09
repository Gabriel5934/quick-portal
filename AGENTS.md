# Quick Portal Workspace

This directory is the Git root of the Quick Portal monorepo:

- `quick-portal-web/` — React/TypeScript frontend.
- `quick-portal-api/` — Django REST Framework backend.
- `quick-docs/` — shared VitePress documentation.

Read and follow the nearest `AGENTS.md` before changing application files.
Child instructions take precedence for application-specific work.

## Repository boundaries

- Run Git commands from this workspace root. The application directories are
  regular directories in this repository, not nested Git repositories.
- Keep related frontend and backend work in the same branch, commit, and PR.
- Run application commands from the relevant child directory.
- Keep frontend and backend dependencies, builds, and deployments independent.
- Never stage `.monorepo-backup/`, local environments, or credentials.
- Check the root `git status` before finishing.

## Frontend: `quick-portal-web/`

**Stack:** React 19, TypeScript, Vite, Material UI, TanStack Router, TanStack
Query, React Hook Form, and Zod.

```bash
cd quick-portal-web
npm run dev       # Vite development server on localhost:5173
npm run build     # TypeScript check and production build
npm run lint      # ESLint
npm run preview   # Preview the production build

docker compose up --build
docker compose -f docker-compose.dev.yml up
docker compose up --build --force-recreate
```

Frontend tests use Vitest (`npm test`). Run tests, build, and lint for relevant
frontend changes.

Important conventions:

- Routes live in `src/routes/`; authenticated routes are nested under
  `src/routes/_authRoutes/`.
- Never edit `src/routeTree.gen.ts` manually; TanStack Router generates it.
- Domain code belongs in `src/features/<domain>/`, with an `index.ts` barrel.
- API mutations belong in `src/hooks/`.
- Use Material UI components and its default breakpoints: `xs` for phones,
  `sm`/`md` for tablets, and `lg`/`xl` for desktops.
- Authentication uses a JWT stored in `localStorage` under the key `token`.

## Backend: `quick-portal-api/`

**Stack:** Django 5, Django REST Framework, SimpleJWT, PostgreSQL 16, nginx, and
Docker Compose.

```bash
cd quick-portal-api
cp .env.example .env.dev
docker compose up --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py test quickportal
docker compose exec web ruff check
docker compose exec web python manage.py createsuperuser
```

`manage.py` is at `app/manage.py`; in Docker, `./app` is mounted at `/app`.

Important conventions:

- `app/config/` contains project settings, root URLs, and the health endpoint.
- `app/quickportal/` contains registration, email-based JWT authentication, and
  OWN Financial integration.
- Keep OWN integration logic in `app/quickportal/services/`.
- OWN credentials must come from environment variables; never commit secrets.
- OWN endpoints require authenticated JWT users.
- Treat `owndocs/` as reference documentation, not application code.
- For production, use strong Django and PostgreSQL secrets, set `DEBUG=0`, and
  configure `ALLOWED_HOSTS`. Use `USE_HTTPS=0` only for HTTP-only QA.

## Full-stack integration

- The local backend API is exposed through nginx at
  `http://localhost:8080`. This is the authoritative development port.
- Production uses port `80` by default unless `NGINX_PORT` overrides it.
- Backend validation errors use the Django REST Framework shape
  `{ "<field>": ["<message>"] }`; preserve that contract or update both sides
  together.
- CORS must allow the Vite development origin at `http://localhost:5173`.

## Verification

Run checks in the application you changed:

```bash
# Frontend
cd quick-portal-web
npm run lint
npm run build

# Backend
cd quick-portal-api
docker compose exec web ruff check
docker compose exec web python manage.py test quickportal
```

If Docker services are not running, report which backend checks could not be
executed rather than claiming they passed.

## Scopes

The app has two main scopes: user and business. User scope is defined by which user is currently logged in, user-scoped UI include the outermost drawer on the left of the screen.
Business scope is defined by which business is currently selected. Business-scoped UI includes the inner-most app bar that contains the business selector and the inner drawer with business related navigation.

Some routes on the business-level drawer are only visible to certain types of businesses.

## Cnae

Model that holds a list of CNAEs as well as its description and related MCC. At the time there were no good sources for this data so we used the list provided by OWN acquirer. A MCC code might be related to multiple CNAEs, thats why in most models including this one CNAE is the key.

## Business

Businesses are used to represent final clients such as restaurants and stores as well as resellers.
A business is identified either by a CPF or CNPJ document.
Changing the document or the type of a business is not allowed.

**Managed Fields**
`name`, `trade_name` and `cnae` are managed fields for business registered with CNPJ. This information is obtained via BrasilAPI's CNPJ service:

```
nome_fantasia > trade_name
razao_social > name
cnae_fiscal > cnae
```

For CPF businesses `name` and `cnae` are inserted manually as there are no free CPF lookup APIs. `trade_name` is left empty.

**Types**
Business can have three types: store, reseller and re-reseller. To understand how they relate to each other see "Hierarchy"

**Example Requests**

```json
{
  "document_type": "CNPJ",
  "document": "61.805.098/0001-49",
  "email": "gabriel@email.com",
  "phone": "987023510",
  "landline": "39232025"
}
```

```json
{
  "document_type": "CPF",
  "document": "52839789801",
  "email": "gabriel@email.com",
  "phone": "982374510",
  "landline": "39232025",

  "name": "gabriel ltda.",
  "cod_cnae": 4814
}
```

**Hierarchy**
Businesses can belong to one another, this is determined by `parent`. Only business of types reseller and re-reseller are allowed to have child businesses. A re-reseller business is the only business thats required to have a parent. A re-reseller can only be parent to store type businesses while resellers can be parents to any type.

Users are related to businesses trough the `BusinessMembership` model. A user who is related to a business is considered related to all children of that business.

## Fee

The fee model is supposed to be a data source and not created by end users. It represents the different fees for different forms of payment across different card networks. Negative installments have a special meaning: -1 for pix and -2 for the acquirer's anticipation fee.
