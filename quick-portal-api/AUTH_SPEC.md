# Quick Portal API: Authentication and Authorization Spec

Describes the behavior of `quick-portal-api` as implemented (Django + DRF +
SimpleJWT). Source of truth is the code; file references are given per section.

## 1. Overview

- **Identity:** Django's built-in `User` model. Login is by **email + password**.
  Usernames are auto-generated (`user_{12 hex}`) and never exposed to clients.
- **Credentials:** short-lived JWT **access token** (response body, sent as
  `Authorization: Bearer <token>`) plus a long-lived **refresh token** that only
  ever lives in an **HttpOnly cookie**.
- **Authorization:** two layers.
  1. Authentication: `IsAuthenticated` on every protected view.
  2. Business scope: per-business roles (`ADMIN`, `MANAGER`, `VIEWER`) via
     `BusinessMembership`, with `is_superuser` as a global override.
- **Third-party auth (outbound/inbound):** OWN OAuth2 client credentials
  (outbound), Cielo shared-secret webhook token (inbound).

## 2. Configuration (`config/settings.py`)

| Setting                                              | Value                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES`      | `JWTAuthentication` only (no session/basic)                                                                 |
| `REST_FRAMEWORK.DEFAULT_PERMISSION_CLASSES`          | **not set**, so DRF default `AllowAny`; every view must declare its own `permission_classes`                |
| `ACCESS_TOKEN_LIFETIME`                              | 5 min                                                                                                       |
| `REFRESH_TOKEN_LIFETIME`                             | 1 day                                                                                                       |
| `ROTATE_REFRESH_TOKENS` / `BLACKLIST_AFTER_ROTATION` | `True` / `True`                                                                                             |
| `INSTALLED_APPS`                                     | includes `rest_framework_simplejwt.token_blacklist`                                                         |
| `REFRESH_TOKEN_COOKIE`                               | name `refresh_token`, path `/api/token/`, `HttpOnly`, `Secure`, `SameSite=None`, max-age = refresh lifetime |
| `AUTH_CSRF_HEADER` / `_VALUE`                        | `X-Requested-With: quick-portal`                                                                            |
| `CORS_ALLOWED_ORIGINS`                               | env `CORS_ALLOWED_ORIGINS` (default `http://127.0.0.1:5173 http://localhost:5173`)                          |
| `CORS_ALLOW_CREDENTIALS`                             | `True`                                                                                                      |
| `CORS_ALLOWED_ORIGIN_REGEXES`                        | `^https?://localhost(:\d+)?$` (CORS only; see 4.1)                                                          |
| `SECRET_KEY`                                         | env `DJANGO_SECRET_KEY`, falls back to an insecure default (signs the JWTs)                                 |
| `AUTH_PASSWORD_VALIDATORS`                           | the four Django defaults (not applied on registration, see 3.1)                                             |

Session/CSRF middleware exist only for the Django admin (`/admin/`); the API
itself is stateless apart from the refresh cookie.

## 3. Endpoints

| Method + path                                                                | Auth          | Permission                       | Purpose                         |
| ---------------------------------------------------------------------------- | ------------- | -------------------------------- | ------------------------------- |
| `POST /users/register/`                                                      | none          | `AllowAny`                       | Create user                     |
| `POST /api/token/`                                                           | none          | `TrustedAuthOrigin`              | Login                           |
| `POST /api/token/refresh/`                                                   | none (cookie) | `TrustedAuthOrigin`              | Rotate refresh, get new access  |
| `POST /api/token/logout/`                                                    | none (cookie) | `AllowAny` + `TrustedAuthOrigin` | Blacklist refresh, clear cookie |
| everything under `/api/businesses/…`, `/own/…`, `/cielo/…` (except webhooks) | JWT           | `IsAuthenticated`                | Business-scoped API             |
| `POST /cielo/…` onboarding + transaction notifications                       | none          | `AllowAny` + webhook token check | Cielo callbacks                 |

### 3.1 Registration: `UserRegistrationView`

- Body: `{ "email", "password" }`. `password` is write-only, `min_length=8`.
  Django's `AUTH_PASSWORD_VALIDATORS` are **not** invoked.
- Rejects an email that already exists, case-insensitively
  (`{"email": "Email address already exists."}`). Uniqueness is enforced in
  application code, not by a DB constraint.
- Creates the user with `create_user` (password hashed), `is_active=True`, not
  staff, not superuser. Returns `201 {id, email}`.
- No origin/CSRF header requirement and no email verification.

### 3.2 Login: `EmailTokenObtainPairView` / `EmailTokenObtainPairSerializer`

Request (needs the `TrustedAuthOrigin` headers, see 4.1):

```
POST /api/token/
Origin: <allowed origin>
X-Requested-With: quick-portal
{ "email": "...", "password": "..." }
```

Flow:

1. Email is stripped, lowercased and looked up with `email__iexact`.
2. Unknown email gives `400 {"email": "No account found with this email."}`.
3. `authenticate(username=<real username>, password=...)`; failure gives
   `400 {"password": "Incorrect password."}`.
4. An inactive account is rejected (`{"email": "This account is inactive."}`).
   Note that Django's `ModelBackend` already returns `None` for inactive users,
   so in practice an inactive user hits step 3's message.
5. Under `user_transaction(user.pk)` (user row lock) SimpleJWT builds the token
   pair. This is what serializes login against concurrent revocation.
6. Response `200 {"access": "<jwt>"}`. The refresh token is **removed from the
   body** and set via `Set-Cookie: refresh_token=…` (see 5).

Any `TokenError` is re-raised as `InvalidToken` (401).

### 3.3 Refresh: `CookieTokenRefreshView`

- Reads the refresh token **only from the cookie**; a body value is ignored.
- Success: `200 {"access": "<new>"}` plus a new `refresh_token` cookie.
- Any failure: `401 {"detail": "...", "code": "token_not_valid"}` **and** the
  cookie is cleared. Details: `"Refresh token cookie is missing."`,
  `"Refresh token was already used."`, `"Refresh token is invalid or expired."`.

### 3.4 Logout: `CookieTokenLogoutView`

- Always `204`, always clears the cookie, even for a missing/invalid/expired
  token (invalid tokens are silently ignored).
- A valid, not-yet-blacklisted token is blacklisted with reason `LOGGED_OUT`.
  A token already blacklisted keeps its original reason.
- Because `permission_classes = [AllowAny, TrustedAuthOrigin]` and DRF ANDs
  them, effectively only `TrustedAuthOrigin` applies.

## 4. Request protection

### 4.1 `TrustedAuthOrigin` (`quickportal/permissions.py`)

CSRF defense for the three cookie-based token endpoints (the refresh cookie is
`SameSite=None`, so browsers send it cross-site). A request passes only if:

1. `Origin` header is present and **exactly** in `settings.CORS_ALLOWED_ORIGINS`
   (the localhost regex in `CORS_ALLOWED_ORIGIN_REGEXES` does **not** count
   here), and
2. `X-Requested-With` equals `quick-portal`.

Otherwise `403` with `"Request origin is not allowed."` or
`"Missing or invalid X-Requested-With header."`. A cross-site form or simple
request cannot set that custom header, and a preflighted request needs CORS
approval, which only allowed origins get. Non-browser clients (curl) must send
both headers manually.

### 4.2 Access-token authentication (all other endpoints)

`JWTAuthentication` validates signature, expiry and token type, loads the user
by id claim, and rejects inactive users. Access tokens are **stateless**: they
are not checked against the blacklist, so logout or revocation does not
invalidate an already-issued access token before its 5-minute expiry.

## 5. Refresh-token lifecycle (`quickportal/services/refresh_tokens.py`)

Cookie: `refresh_token`, `Path=/api/token/`, `HttpOnly; Secure; SameSite=None`,
`Max-Age` = 86400s. The cookie is cleared by re-setting it with `Max-Age=0`,
an epoch `Expires`, and identical path/secure/samesite (required for browsers
to replace it).

### 5.1 Blacklist reasons (`BlacklistedTokenReason`, 1:1 with `BlacklistedToken`)

| Reason       | Set by                              | If presented again                                       |
| ------------ | ----------------------------------- | -------------------------------------------------------- |
| `ROTATED`    | successful refresh                  | **reuse detected**: revoke all of the user's tokens, 401 |
| `LOGGED_OUT` | logout                              | 401 only                                                 |
| `REVOKED`    | reuse-triggered revocation          | 401 only                                                 |
| _(no row)_   | legacy / external blacklist entries | treated as reuse (fail closed)                           |

### 5.2 Rotation algorithm: `rotate_refresh_token(raw_token)`

1. Reject if empty. Verify signature/expiry, `token_type == "refresh"`, and
   `jti` present (no blacklist check yet). Else `InvalidRefreshToken`.
2. Open `_user_transaction(user_id)`: lock the user row, then the
   `OutstandingToken` row for the `jti`.
3. Look up blacklist reason:
   - `ROTATED` or empty gives **reuse**: `revoke_user_tokens(user_id)` inside
     the transaction, raise `RefreshTokenReused` after commit.
   - `LOGGED_OUT` / `REVOKED` gives `InvalidRefreshToken`.
   - not blacklisted gives `TokenRefreshSerializer` rotates it (new refresh +
     access, old blacklisted), then the old token's reason is recorded as
     `ROTATED`.

### 5.3 Revocation: `revoke_user_tokens(user_id)`

Under the user lock, bulk-blacklists every outstanding, not-yet-blacklisted
token of the user and records `REVOKED` for entries without a reason.

### 5.4 Concurrency invariant

Lock order is always **user row first, then token rows**. Every path that
changes a user's tokens (login, rotation, logout, revocation) must go through
`_user_transaction` (`user_transaction` for external callers). The user lock
uses `FOR NO KEY UPDATE`, so FK checks from other writes referencing the user
are not blocked. This guarantees that two concurrent refreshes with the same
token cannot both succeed, and that a revocation never misses a token created
by an in-flight login/rotation.

### 5.5 Maintenance and known gap

- Run `python manage.py flushexpiredtokens` periodically (also deletes the
  associated reason rows via cascade).
- Accepted gap: a logout request that never reaches the API (offline/timeout)
  leaves the refresh token valid until it expires.

- **OWN (outbound)**, `own/services/own_auth.py`: OAuth2 client-credentials
  using `OWN_CLIENT_ID`, `OWN_CLIENT_SECRET`, `OWN_SCOPE` against
  `OWN_AUTH_URL`. Token cached in `LocMemCache` (per-process) for
  `expires_in - 10s` (min 30s, default `expires_in` 300). `POST /own/auth/`
  requires `IsAuthenticated` and returns only a masked preview
  (first 10 chars).
- **Cielo (inbound webhooks)**, `cielo/views.py`: onboarding and transaction
  notification endpoints use `authentication_classes = []` and `AllowAny`, and
  authenticate by the shared secret header `X-Cielo-Webhook-Token`, compared
  with `hmac.compare_digest` against `CIELO_WEBHOOK_TOKEN`.
  - `CIELO_WEBHOOK_TOKEN` (and `CIELO_MERCHANT_ID` for onboarding) blank gives
    `500` "not configured".
  - Wrong/missing token gives `401`.
  - Onboarding additionally requires `MasterMerchantId == CIELO_MERCHANT_ID`
    (else `403`).
- **Cielo (outbound)**: `CIELO_MERCHANT_ID` / `CIELO_CLIENT_SECRET` used by
  `cielo/services/cielo_api.py`.

## 8. Error contract

| Situation                                    | Status    | Body shape                                               |
| -------------------------------------------- | --------- | -------------------------------------------------------- |
| Bad login credentials / unknown email        | 400       | `{"<field>": "<msg>"}`                                   |
| Origin/header check fails on token endpoints | 403       | `{"detail": "..."}`                                      |
| Invalid/expired/reused/missing refresh       | 401       | `{"detail", "code": "token_not_valid"}` + cookie cleared |
| Missing/invalid/expired access token         | 401       | DRF/SimpleJWT default                                    |
| Business not accessible or not found         | 404       | DRF `NotFound`                                           |
| Role insufficient on an accessible business  | 403       | DRF `PermissionDenied`                                   |
| Webhook token wrong / unconfigured           | 401 / 500 | `{"detail": "..."}`                                      |

Validation errors keep DRF's `{ "<field>": ["<message>"] }` shape as required
by the monorepo contract.

## 9. Client flow (frontend contract)

1. `POST /api/token/` (with `Origin` + `X-Requested-With`, `credentials:
include`): keep `access` in memory; the browser stores the cookie.
2. Call API with `Authorization: Bearer <access>`.
3. On `401` or before expiry (about 5 min): `POST /api/token/refresh/` with the
   same headers/credentials; replace the in-memory access token. A `401` there
   means the session is over, so send the user to login.
4. `POST /api/token/logout/` on sign-out, then drop the in-memory token.

## 10. Observations and risks

These are things the implementation does today, not changes made.

1. **No default permission class.** `AllowAny` is DRF's default; a new view that
   forgets `permission_classes` is public. Consider setting
   `DEFAULT_PERMISSION_CLASSES = [IsAuthenticated]`.
2. **Account enumeration.** Login distinguishes "No account found with this
   email" from "Incorrect password", and membership grant distinguishes
   unregistered emails. Registration also reveals existing emails.
3. **No rate limiting/throttling** on login, registration, or refresh
   (no `DEFAULT_THROTTLE_*` configured).
4. **Registration skips Django password validators**; only `min_length=8`.
5. **Email uniqueness is not a DB constraint**; concurrent registrations can
   create duplicates (the membership serializer already works around this).
6. **Access tokens survive logout/revocation** for up to 5 minutes.
7. **Insecure `SECRET_KEY` fallback** if `DJANGO_SECRET_KEY` is unset (it signs
   all JWTs).
8. **`REFRESH_TOKEN_COOKIE.secure` is always `True`** (even when `USE_HTTPS` is
   off); this works on `localhost` but not on plain-HTTP non-localhost QA hosts.
9. **Origin check vs CORS regex mismatch**: any `localhost:<port>` passes CORS
   but only exact `CORS_ALLOWED_ORIGINS` entries pass `TrustedAuthOrigin`.
10. **`LocMemCache` for the OWN token** is per-process, so each worker fetches
    its own token.
