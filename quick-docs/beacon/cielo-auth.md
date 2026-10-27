# Cielo Authentication

Related doc: [Cielo/Auth Token](../cielo/auth-token)

Below is described how Beacon handles authenticating with Cielo Split API.

Cielo tokens are stored in-memory since they have a short lifespan. Before making any calls to Cielo it is checked if the in-memory token is still valid and a new one is requestes only if it isn't.
