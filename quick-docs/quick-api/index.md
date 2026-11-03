# Quick API

Quick API is a lightweight version of the legacy quick-portal-api that aims to replace it.

Development server runs on port 8100.

All Cielo environment variables are required at startup.

# Infrastructure

This app is containerized and has two compose files: one for local development and another for build environments. The dev compose file is included in the root `quick-portal` compose file so it starts with the `make dev` command.

Currently the only deployed environment for this API is "sandbox" which is deployed through AWS Lightsail running a single uvicorn worker. Below are details of the instance:

**quick-api-sandbox**
sa-east-1a
General purpose
Dual-stack (ipv4 and ipv6)
512 MB Memory
2 vCPUs Processing
20 GB SSD Storage
512 GB Transfer
Ubuntu 24.04 LTS

The SQLite file lives on the instance’s disk in `./data` and it is bind mounted to the API container

## Networking

A free domain was provisioned for the sandbox environment using DuckDNS, it is routed to a static IPv4 address attached to the Lightsail instance.

```
quick-api-sandbox.duckdns.org
```

A Caddy service acts as a reverse proxy routing all traffic from the DuckDNS domain to uvicorn. The hostname is sourced by Caddyfile from an environment variable named API_HOST

## HTTP Client

To make requests to 3rd party services we use the requests API.
Every request is made on a 120s timeout using requests module timeout argument.

## Features

[Auth](./auth.md)

**Cielo**
All Cielo code lives in the `app/cielo` directory, all models, and URLs are prefixed with `cielo`.
`CIELO_AUTH_BASE_URL` and `CIELO_ONBOARDING_BASE_URL` are used to defined the base URL used to request token and onboarding.
[Cielo Auth](./cielo-auth)
[Onboarding](./onboarding)

## Out of Scope / To-do

Quick API is a WIP. Below is described whats already planned ahead:

- LGPD compliance: Encryption at rest or field-level encryption is required before go-live. Cielo seller onboarding payloads include sensitive information data.
- Database backups: Will happen through a daily cronjobs and S3 bucket uploads in the future.
- The purge of expired refresh tokens runs only at startup, so a long-running instance never purges.
