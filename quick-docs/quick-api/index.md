# Quick API
Quick API is a lightweight version of the legacy quick-portal-api that aims to replace it.
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

A free domain was provisioned for the sandbox environment using DuckDNS, it is routed to a static ipv4 address attached to the Lightsail instance.

```
quick-api-sandbox.duckdns.org
```

A Caddy service acts as a reverse proxy routing all traffic from the DuckDNS domain to uvicorn. The hostname is sourced by Caddyfile from an env var API_HOST

## Features

## Out of Scope / TODO
Quick API is a WIP. Below is described whats already planned ahead:
- LGPD compliance: Encryption at rest or field-level encryption is required before go-live. Cielo seller onboarding payloads include sensitive information data.
- Database backupsL: Will happen through a daily cron jobs and s3 bucket uploads in the future.
