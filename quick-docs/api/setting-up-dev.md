# Setting up dev

How to get your local environment up and running.

## Setup

Run the make command below at the root of the project. In order, it will:

1. Copy the env example files from quick-portal-api and cielo-mock into .env.dev and .env
2. Build and start the containers, waiting until they are healthy
3. Create the dev superuser
4. Create a root reseller business calles Quick Digital with a Cielo plan named Quick Plan and already signed up with Cielo

```bash
make dev
```

This command does not overwrite your development env files.

Every env variable is ready to go with the exception of OWN credentials that need to be manually replaced.

The example env file is well documented. Read it to understand what each variable does. Whenever adding a new environment variable that has no clear purpose just from its name add a comment documenting it.

## Containers

`make dev` starts these containers:

- quick-portal-api (web)
- quick-portal-api database (db)
- quick-portal-web (app)
- quick portal docs (docs)
- cielo mock api (cielo-mock)
- nginx

To start them again later without seeding, run the compose command at the root of the project:

```bash
docker compose up -d
```

If you want to start over, remove all volumes with the command below:

```bash
docker compose down -v
```
