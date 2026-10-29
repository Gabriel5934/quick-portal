# Beacon

Beacon is a Quick Digital service that handles time-sensitive operations that have financial impact on the company.

Currently the only service integrated with Beacon is Cielo Split API. The main goal of Beacon is to listen to all transaction and onboarding notifications from Cielo and store them. Schemas, models and routing for Cielo live in its own `/cielo` directory. All models, enums and routes are prefixed with `cielo`.

This service aims to be lightweight, reliable and easy to setup. For that reason the chosen stack is FastAPI + (SQLite + SQLAlchemy + Alembic).

# Infrastructure

This app is containerized and has two compose files: one for local development and another for build environments. The dev compose file is included in the root `quick-portal` compose file so it starts with the `make dev` command.

Currently the only deployed environment for this API is "sandbox" which is deployed through AWS Lightsail running a single uvicorn worker. Below are details of the instance:

**quick-beacon-sandbox**
sa-east-1a
General purpose
Dual-stack (ipv4 and ipv6)
512 MB Memory
2 vCPUs Processing
20 GB SSD Storage
512 GB Transfer
Ubuntu 24.04 LTS

The SQLite file lives on the instance’s disk in `./data` and it is bind mounted to the API container.

## Networking

A free domain was provisioned for the sandbox environment using DuckDNS, it is routed to a static ipv4 address attached to the Lightsail instance.

```
quick-beacon-sandbox.duckdns.org
```

A Caddy service acts as a reverse proxy routing all traffic from the DuckDNS domain to uvicorn. The hostname is sourced by Caddyfile from an env var API_HOST

## Features

**Cielo**
[Notifications](./notifications.md)

## Out of Scope / TODO

Beacon is a WIP. Below is described whats already planned ahead:

- Split: Looking up transactions and requesting payment spliting after receiving a notification; How to handle duplicate notifications in order to avoid duplicate split requets.
- LGPD compliance: Encryption at rest or field-level encryption is required before go-live. Payload including sensitive information data include: bank account validation status notification and transaction lookup.
- Database backupsL: Will happen through a daily cron jobs and s3 bucket uploads in the future.
- Plan B if the Beacon misses notifications - if the service is down for more then 90 minutes it might miss notification. That requires human intervention to recover them and the exact process is out of scope.
