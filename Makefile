COMPOSE ?= docker compose -f docker-compose.dev.yml

.PHONY: dev dev-env sbs sps

# Fill the dev env files, start the root dev stack and wait until it is
# healthy, then seed the admin seller in cielo-mock. The seed overwrites its
# own record, so running make dev again is safe. Then create the dev login
# user (user@example.com, password "password") in quick-api; an existing user
# is left unchanged, so this step is safe to repeat too.
dev: dev-env
	$(COMPOSE) up --build --detach --wait
	$(COMPOSE) exec -T cielo-mock npm run seed:admin-business
	$(COMPOSE) exec -T quick-api python -m app.scripts.create_dev_user

# Create or complete the untracked root env files the dev stack reads, with
# scripts/dev-env.sh (POSIX sh; see its header for usage). Only keys that are
# missing or empty are set; non-empty values, other keys and comments are kept,
# so running it again changes nothing. A missing file starts from its
# .example, a bare KEY gets a random hex value from openssl, and each file is
# left with mode 600. Key names are printed, never values.
# The root .env (Compose settings such as COMPOSE_FILE) is copied from
# .env.example only when it is missing; an existing .env is never overwritten.
# The webhook token must be the same on both sides: cielo-mock sends it to
# beacon. The Cielo settings point Quick API at cielo-mock over the compose
# network and match the credentials hard-coded in cielo-mock/src/config.ts.
dev-env:
	@[ -f .env ] || { cp .env.example .env && chmod 600 .env && echo "created .env"; }
	@sh scripts/dev-env.sh .env.beacon .env.beacon.example \
	  CIELO_WEBHOOK_TOKEN=cielo-webhook-token
	@sh scripts/dev-env.sh .env.cielo-mock .env.cielo-mock.example \
	  MOCK_CIELO_NOTIFICATION_TOKEN=cielo-webhook-token
	@sh scripts/dev-env.sh .env.portal .env.portal.example \
	  JWT_SECRET \
	  CIELO_MERCHANT_ID=00000000-0000-0000-0000-000000000000 \
	  CIELO_CLIENT_SECRET=mock-cielo-secret \
	  CIELO_AUTH_BASE_URL=http://cielo-mock:3000 \
	  CIELO_ONBOARDING_BASE_URL=http://cielo-mock:3000

sbs: # ssh into beacon sandbox
	ssh -i lightsail-key.pem ubuntu@56.125.158.204

sps: # ssh into portal sandbox
	ssh -i lightsail-key.pem ubuntu@56.126.92.35
