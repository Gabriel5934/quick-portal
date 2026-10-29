# Quick Portal Workspace

This directory is the Git root of the Quick Portal monorepo:

- `quick-portal-web/` — React/TypeScript frontend.
- `quick-portal-api/` — Django REST Framework backend.
- `quick-docs/` — shared VitePress documentation.
- `beacon/` - notification service

Read and follow the nearest `AGENTS.md` before changing application files.
Child instructions take precedence for application-specific work.

## Repository boundaries

- Run Git commands from this workspace root. The application directories are
  regular directories in this repository, not nested Git repositories.
- Keep related frontend and backend work in the same branch, commit, and PR.
- Run frontend npm commands from `quick-portal-web/`. Run integrated Docker
  Compose commands from this Git root.
- Keep frontend and backend dependencies, builds, and deployments independent.
- Check the root `git status` before finishing.

## Integrated Docker Compose project

The root `docker-compose.yml` includes the child development Compose files and
runs as the `quick-portal` project. Use it when checking the running monorepo
stack. Its services are `app` (React frontend), `web` (Django API), `db`
(PostgreSQL), `nginx` (API proxy), and `docs` (VitePress).

```bash
# Run from this Git root
docker compose ls --all
docker compose ps
docker compose exec -T web python manage.py showmigrations own
```

Running `docker compose ps` inside `quick-portal-api/` or `quick-portal-web/`
checks a separate child project; an empty result there does **not** mean the
root `quick-portal` services are stopped. If a sandboxed Docker command reports
permission denied for the Docker socket, request elevated Docker access and
retry before concluding that services are unavailable. Do not print container
environment variables or credentials during diagnostics.

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

# Backend: run from the Git root against the integrated stack
cd ..
docker compose exec -T web ruff check
docker compose exec -T web python manage.py test quickportal
```

If the root Docker services are not running or cannot be accessed after the
permission retry, report which backend checks could not be executed rather
than claiming they passed.

## Scopes

The app has two main scopes: user and business. User scope is defined by which user is currently logged in, user-scoped UI include the outermost drawer on the left of the screen.
Business scope is defined by which business is currently selected. Business-scoped UI includes the inner-most app bar that contains the business selector and the inner drawer with business related navigation.

Business-scoped routes live under `src/routes/_authRoutes/_businessRoutes/`, which renders the business layout. User-scoped pages, such as creating a new business (`/novo-ec`), live directly under `src/routes/_authRoutes/` and are linked from the outer drawer. Some routes on the business-level drawer are only visible to admins of the selected business.

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

Users are related to businesses through the `BusinessMembership` model. Access is direct only: a user can access a business only through a membership on that business itself, never through its parent. New businesses are always stores without a parent, and any authenticated user can create one; the creator becomes its admin.

Plans (OWN and Cielo), recurring fees, and OWN/Cielo signups belong to the business itself: a business signs up with its own plans and its recurring fees apply to itself. Any business type, stores included, can have them, and only admins of the business can create or change them.

## Fee

The fee model is supposed to be a data source and not created by end users. It represents the different fees for different forms of payment across different card networks. Negative installments have a special meaning: -1 for pix and -2 for the acquirer's anticipation fee.
