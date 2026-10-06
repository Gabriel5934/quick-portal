COMPOSE ?= docker compose

ENV_FILES := quick-portal-api/.env.dev local-mock-cielo/.env

.PHONY: dev

# Create missing env files from their examples, create or update the dev
# superuser, then create Quick Digital in Quick Portal and register the same
# seller in the mock Cielo API. Existing env files are never overwritten, and
# both Quick Digital steps do nothing if it already exists.
dev: $(ENV_FILES)
	$(COMPOSE) exec -T web python manage.py create_dev_user root@email.com 'JustTesting593!' --superuser
	$(COMPOSE) exec -T web python manage.py create_admin_business
	$(COMPOSE) exec -T mock-cielo npm run seed:admin-business

# Order-only prerequisites: copy only when the env file is missing, even if the
# example is newer.
quick-portal-api/.env.dev: | quick-portal-api/.env.dev.example
	cp $| $@

local-mock-cielo/.env: | local-mock-cielo/.env.example
	cp $| $@
