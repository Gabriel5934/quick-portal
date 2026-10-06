# Setting up dev

How to get your local environment up and running.

## Environment Variables and root business

Run the make command below to:

- Copy the env example files from quick-portal-api and mock-cielo into .env.dev and .env
- Create a root reseller business calles Quick Digital with a Cielo plan named Quick Plan and already signed up with Cielo

```bash
make dev
```

This command does not overwrite your development env files.

Every env variable is ready to go with the exception of OWN credentials that need to be manually replaced.

The example env file is well documented. Read it to understand what each variable does. Whenever adding a new environment variable that has no clear purpose just from its name add a comment documenting it.

## Containers

After that you can start the containers by running the compose command at the root of the project:

```bash
docker compose up -d
```

This will start:

- quick-portal-api (web)
- quick-portal-api database (db)
- quick-portal-web (app)
- quick portal docs (docs)
- cielo mock api (mock-cielo)
- nginx

If you want to start over, remove all volumes with the command below:

```bash
docker compose down -v
```
