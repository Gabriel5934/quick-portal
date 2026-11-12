# Auth

Quick API authenticate users by email and password. A login returns a short-lived access token in the response body and sets a refresh token in an HttpOnly cookie. Refresh tokens are rotated on every use, and replaying an old one is considered theft and logs the user out everywhere.

## Endpoints

| Route          | Auth         | Method | Behaviour                                   |
| -------------- | ------------ | ------ | ------------------------------------------- |
| /auth/register | -            | POST   | 409 for existing email, 422 invalid payload |
| /auth/login    | -            | POST   |                                             |
| /auth/refresh  | Cookie, CSRF | POST   | 401 clears the cookie                       |
| /auth/logout   | Cookie, CSRF | POST   |                                             |
| /auth/me       | Bearer       | GET    |                                             |

## User Model

Emails are stripped and lowercased. Passwords must be 15 to 64 characters (counted as Unicode code points) with no character-class requirements. Any character is allowed, including spaces and Unicode, and passwords are not trimmed.

If user is not found `PasswordHash.verify` is executed anyways with a dummy hash so requests that do not found a user do not take less time then the ones that do. Thus avoiding timing-attacks.

### Password Hashing

Passwords are hashed using the recomended algorithm from pwdlib, which at the time of writing is Argon2. Argon2 generates a random salt for each hash.

## Access Token

Valid for `ACCESS_TOKEN_TTL_SECONDS`, defaults to 5 minutes.
// TODO talk about token version

## Refresh token

Only ever sent in the cookie named `refresh_token` configured as `HttpOnly`, `Path=/auth`. `Max-Age` is `ACCESS_TOKEN_TTL_SECONDS` which defaults to 1 day.

Two concurrent requests could refresh using the same token, which is not allowed. Because of that the revokation of the old token is conditional to `revoked_at` being null. An since SQLite allows for only one writer at a time, the requests that tries to run after will either get flagged as reused or 401 depending on wether the revoke reason was rotation or logging out.

### Rotation and blacklisting

Tokens are deleted on a purge that runs at startup and only expired tokens are deleted (`purge()` at main.py).

Every refresh token has a revoked reason field. If a token that was revoked by the reason of "refresh" and is not expired is used again we consider the token stolen. That triggers a revokation of all outstanding tokens for that user and bumps `tv` for every access token making them invalid.

## CSRF

// todo
