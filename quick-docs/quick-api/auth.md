# Auth

Related doc: `quick-portal-api/AUTH_SPEC.md` (legacy behaviour this mirrors)

Quick API authenticates users by email and password. A login returns a short-lived access token in the response body and sets a refresh token in an HttpOnly cookie. Refresh tokens are rotated on every use, and replaying an old one logs the user out everywhere.

## Endpoints

All routes live under `/auth`.

| Route                 | Auth                 | Behaviour                                                                                  |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `POST /auth/register` | none                 | Body `{email, password}`. 201 `{id, email}`; 409 if the email exists; 422 if invalid       |
| `POST /auth/login`    | none                 | Body `{email, password}`. 200 `{access_token, token_type: "bearer", expires_in}` + cookie |
| `POST /auth/refresh`  | cookie + CSRF header | Rotates the refresh token. 200 with a new access token and cookie, otherwise 401           |
| `POST /auth/logout`   | cookie + CSRF header | Revokes the refresh token and clears the cookie. Always 204                                |
| `GET /auth/me`        | Bearer               | 200 `{id, email}`                                                                          |

Emails are stripped and lowercased before they are stored or looked up. Passwords need at least 10 characters and are hashed with Argon2 (pwdlib).

Login returns the same 401 `Invalid email or password.` for an unknown email, a wrong password and an inactive account. An unknown email still runs a dummy hash verify, so response times don't reveal which emails exist.

Every 401 from `/auth/refresh` also clears the cookie. The `detail` is one of `Refresh token cookie is missing.`, `Refresh token was already used.` (reuse) or `Refresh token is invalid or expired.`.

## Tokens

**Access token**: HS256 JWT signed with `JWT_SECRET`, valid for `ACCESS_TOKEN_TTL_SECONDS` (default 5 minutes). Claims are `sub` (user id), `iat`, `exp`, `typ=access` and `tv` (the user's `token_version`). Sent as `Authorization: Bearer <token>`. A token is rejected when the signature, expiry or any claim is invalid, when the user is missing or inactive, or when `tv` differs from the user's current `token_version`.

**Refresh token**: an opaque random string, not a JWT, valid for `REFRESH_TOKEN_TTL_SECONDS` (default 1 day). Only its SHA-256 hash is stored in `refresh_tokens`, so a database leak yields no usable tokens. It is only ever sent in the cookie:

- Name `refresh_token`, `HttpOnly`, `Path=/auth`, `Max-Age` = refresh TTL.
- `Secure` and `SameSite` come from `COOKIE_SECURE` (default true) and `COOKIE_SAMESITE` (default `lax`). The dev compose sets `COOKIE_SECURE=false` for `http://localhost`. A frontend on another site needs `SameSite=none`, which requires `Secure`.

`JWT_SECRET` is required and must be at least 32 bytes; the app refuses to start otherwise. `make dev` generates `quick-api/.env` with a random one. Changing it invalidates every access token but no refresh tokens.

## Rotation and blacklist

A refresh revokes the presented token with reason `rotated`, inserts a new one and points the old row's `replaced_by_id` at it. Revoked rows stay in the table, which is what makes reuse detectable. Rows are deleted only after `expires_at`, by a purge that runs at startup.

| `revoked_reason` | Set by          | If presented again       |
| ---------------- | --------------- | ------------------------ |
| `rotated`        | refresh         | reuse detected (below)   |
| `logout`         | logout          | 401 only                 |
| `reuse_detected` | reuse detection | 401 only                 |

An expired token, revoked or not, or an unknown token, gets a plain 401. An expired `rotated` token never triggers reuse detection.

Two concurrent refreshes with the same token can both read it as unrevoked, so the revoke is a conditional `UPDATE ... WHERE id = :id AND revoked_at IS NULL`. Only the request whose update changes the row gets a new token. The other re-reads the row's reason and follows the table above: losing to another refresh counts as reuse, and losing to a logout is a plain 401.

## Reuse detection

Presenting a token whose reason is `rotated` means a token that was already exchanged is being used again, so either the user or an attacker holds a stolen copy. Quick API then:

1. Revokes every unrevoked refresh token of that user with reason `reuse_detected`.
2. Increments `users.token_version`, which immediately invalidates every access token already issued to the user.
3. Commits, then returns 401 and clears the cookie.

The user has to log in again on every device. Other users are not affected. Logging out, or replaying a logged-out token, never triggers this.

## CSRF

`/auth/refresh` and `/auth/logout` require the header `X-Requested-With: quick-portal`; without it they return 403. A cross-site form cannot set custom headers, and a cross-origin `fetch` that sets one needs a CORS preflight, which only `CORS_ALLOWED_ORIGINS` (default `http://localhost:5173`) passes. CORS allows credentials, so the app refuses to start if that list contains `*`. Unlike legacy, the `Origin` header is not checked.

## Known gaps

- Two tabs refreshing at once, or a retried refresh, look like reuse and log the user out everywhere. There is no grace window.
- No rate limiting or lockout on login and registration.
- Registration is open to anyone, as in legacy.
