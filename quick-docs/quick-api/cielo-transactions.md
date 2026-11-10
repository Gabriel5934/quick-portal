# Cielo Transactions

The Beacon service constantly receives transaction notifications. Quick API can fetch those transactions trough Beacon's private IP address.

For local setups the private IP is simply the service hostname which is `beacon`. For production builds check the Networking tab on the respective Lightsail instance.

The IP address must be set as an environment variable called `BEACON_PRIVATE_IP`.

Beacon also requires a matching `X-Portal-Token` header that should be set as an environment variable called `BEACON_PORTAL_TOKEN`.

All endpoints are available through the private IP because that route skips Caddy. Caddy blocks any requests that aren't POST /cielo/notifications.

| Route               | Auth   | Method |
| ------------------- | ------ | ------ |
| /cielo/transactions | Bearer | GET    |
