# Quick API

Quick API is a lightweight version of the legacy Django API that aims to replace it.

Development server runs on port 8100.

All Cielo environment variables are required at startup.

# Infrastructure

This app is containerized and has two compose files: one for local development and another for build environments, which `quick-portal/docker-compose.yml` includes. The dev compose file is included in the root `quick-portal` compose file so it starts with the `make dev` command.

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

Quick API is not publicly accessible. The browser only talks to Quick Portal, whose server functions call Quick API over the compose network at `http://quick-api:8000`. The build compose file publishes no port on the host.

A free domain was provisioned for the sandbox environment using DuckDNS, it is routed to a static IPv4 address attached to the Lightsail instance.

```
quick-portal-sandbox.duckdns.org
```

A Caddy service acts as a reverse proxy routing all traffic from the DuckDNS domain to Quick Portal. The hostname is sourced by Caddyfile from an environment variable named PORTAL_HOST

Caddy and Quick Portal are defined in `quick-portal/docker-compose.yml`, which includes `quick-api/docker-compose.yml` so both apps share one network. Start the stack from the repository root with:

```sh
docker compose -f quick-portal/docker-compose.yml up --build --detach
```

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
