COMPOSE ?= docker compose

ENV_FILES := quick-portal-api/.env.dev cielo-mock/.env

.PHONY: dev

# Create missing env files from their examples, start the stack and wait until
# it is healthy, create or update the dev superuser, then create Quick Digital
# in Quick Portal and register the same seller in the mock Cielo API. Existing
# env files are never overwritten; conflicting Quick Digital records on both
# sides are.
dev: $(ENV_FILES)
	$(COMPOSE) up --build --detach --wait
	$(COMPOSE) exec -T web python manage.py create_dev_user root@email.com 'JustTesting593!' --superuser
	$(COMPOSE) exec -T web python manage.py create_admin_business
	$(COMPOSE) exec -T cielo-mock npm run seed:admin-business

# Order-only prerequisites: copy only when the env file is missing, even if the
# example is newer.
quick-portal-api/.env.dev: | quick-portal-api/.env.dev.example
	cp $| $@

cielo-mock/.env: | cielo-mock/.env.example
	cp $| $@
