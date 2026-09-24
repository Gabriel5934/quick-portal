# Mock Cielo

Small Express and TypeScript implementation of the Cielo OAuth2 and seller
onboarding endpoints used by Quick Portal.

## Credentials

The mock intentionally uses fixed development credentials:

```text
Merchant ID:  f88cc14d-c796-4939-957e-de4dddcb2257
Client secret: quick-portal-mock-secret
```

The token endpoint validates HTTP Basic authentication and
`grant_type=client_credentials`. Issued bearer tokens expire after 20 minutes.

## Run

From the repository root, the integrated stack builds and starts this service
automatically:

```bash
docker compose up --build
```

The mock is available from the host at `http://localhost:3001`. Quick Portal's
backend uses the Docker-network address `http://mock-cielo:3000` by default.

To start only the mock:

```bash
docker compose -f mock-cielo/docker-compose.dev.yml up --build
```

## Endpoints

- `POST /oauth2/token` accepts URL-encoded OAuth2 client credentials and returns
  `access_token`, `token_type`, and `expires_in`.
- `POST /api/merchants` accepts the Cielo seller payload, requires a valid
  bearer token, and returns `201 {"MerchantId":"<UUID>"}`.
- `GET /health` supports container health checks.

Cielo-style request failures are returned as an array of `Code` and `Message`
objects. Invalid OAuth credentials use the standard `invalid_client` response.

## Request and response logs

Every request and response is written to stdout as structured JSON with a
shared request ID. Entries include method, path, parsed request body, response
status, response body, and duration. Access tokens and secret-like fields are
redacted, and authorization headers are never logged.

Follow the logs from the repository root with:

```bash
docker compose logs --follow mock-cielo
```

## Persistence

Successful sellers and every onboarding attempt are written atomically to
`/app/data/cielo.json`. Docker stores that file in the `mock_cielo_data` named
volume. Local development writes it to `data/cielo.json`, which is ignored by
Git.

## Response modes

Set `MOCK_CIELO_ONBOARDING_MODE` before starting the service to exercise Quick
Portal's result handling:

| Mode                | Onboarding response                                                  |
| ------------------- | -------------------------------------------------------------------- |
| `success`           | Validates and persists the seller, then returns a Cielo merchant ID. |
| `validation_error`  | Returns a Cielo-style `400` validation error.                        |
| `server_error`      | Returns a Cielo-style `500` service error.                           |
| `malformed_success` | Returns `201` without a merchant ID.                                 |

For example:

```bash
MOCK_CIELO_ONBOARDING_MODE=server_error docker compose up --build mock-cielo web
```
