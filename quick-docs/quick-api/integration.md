---
description: Describes how authentication with client secrets work
---

# Integration

Users can integrate their own systems with quick-api. To do so they need to authenticate using client credentials.

The api expects those credentials to be passes as a basic authenticaded header, concatenated by a colon and converted to base 64.

The api also requires a form url-enconded body with the key-valuepair "grant_type: client_credentials".

Client credentials are per-business. A client id, once generated is fixed. Client secrets cannot be read again, only rotated.
Because of that /generate can only be called one time per business.

Integration tokens have the aud claim set to 'integration' to differentiate it from user tokens. They also have a scope claim which can be used to limit the endpoints that these tokens can reach.
Integration token decodification rejects any token without aud=integration. User token decodification rejects any token without aud=user.

Integration auth also returns refresh tokens. It does not include the refresh token in a cookie like user auth.
