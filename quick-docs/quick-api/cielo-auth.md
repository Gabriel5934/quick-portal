---
description: Cielo authentication in the Quick API
---

# Cielo Authentication

Related doc: [Cielo/Auth Token](../cielo/auth-token)

Below is described how Quick API handles authenticating with Cielo Split API.

Cielo tokens are stored in-memory since they have a short lifespan.

Before each Cielo call, Quick API requests a new token if none is cached or the cached token expires within 60 seconds. Otherwise, it reuses the cached token. This margin reduces the chance that a token expires mid-request.

## Lock

The token manager uses a single-flight refresh pattern to prevent duplicate token requests. Before each Cielo call, the handler checks whether the cached token is still valid (with a 60-second safety margin) and returns it immediately if so. If it has expired, the thread must acquire a threading.Lock, which lets only one thread at a time perform the refresh. After acquiring the lock, the thread checks validity a second time, since another thread may have refreshed the token while it waited. If the token is now valid it is reused; otherwise the thread requests a new one and updates the cached token and expiration. Concurrent requests that arrived during the refresh wait on the lock and then reuse the new token, so a burst of requests with an expired token results in exactly one call to the auth service. The lock is scoped to a single process, so deployments with multiple workers may perform one refresh per worker.

## Error Handling

In case of a 400 or 401 we trhow a 502 error with body: `{message: "Invalid Cielo Credentials"}`, other errors bubble up to the client.

## Environment Variables

`CIELO_MERCHANT_ID` and `CIELO_CLIENT_SECRET` - Used to build the Authorization Basic header required to request a token
