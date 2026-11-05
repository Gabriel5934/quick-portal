COMPOSE ?= docker compose -f docker-compose.dev.yml

.PHONY: dev dev-env sbs sps

# Fill the dev env files, then start the root dev stack and wait until it is
# healthy.
dev: dev-env
	$(COMPOSE) up --build --detach --wait

# Create or complete the env files the dev stack reads. Only keys that are
# missing or empty are set; non-empty values, other keys and comments are kept,
# so running it again changes nothing. A missing file starts from its example.
# The webhook token must be the same on both sides: cielo-mock sends it to
# beacon. The Cielo settings point Quick API at cielo-mock over the compose
# network and match the credentials hard-coded in cielo-mock/src/config.ts.
dev-env:
	@python3 -c "$$SET_ENV_KEYS" beacon/.env beacon/.env.example \
	  CIELO_WEBHOOK_TOKEN=cielo-webhook-token
	@python3 -c "$$SET_ENV_KEYS" cielo-mock/.env cielo-mock/.env.example \
	  MOCK_CIELO_NOTIFICATION_TOKEN=cielo-webhook-token
	@python3 -c "$$SET_ENV_KEYS" .env.portal .env.portal.example \
	  JWT_SECRET \
	  CIELO_MERCHANT_ID=00000000-0000-0000-0000-000000000000 \
	  CIELO_CLIENT_SECRET=mock-cielo-secret \
	  CIELO_AUTH_BASE_URL=http://cielo-mock:3000 \
	  CIELO_ONBOARDING_BASE_URL=http://cielo-mock:3000

sbs:
	ssh -i lightsail-key.pem ubuntu@56.125.158.204

sps:
	ssh -i lightsail-key.pem ubuntu@56.126.92.35

# Usage: python3 -c "$$SET_ENV_KEYS" FILE EXAMPLE KEY=VALUE... [KEY...]
# Sets each KEY whose value in FILE is missing or empty; a bare KEY gets a
# random secrets.token_urlsafe(32). FILE starts from EXAMPLE when missing and
# is written with mode 600 only when it changes. Prints key names, never values.
define SET_ENV_KEYS
import os, re, secrets, sys

path, example, *pairs = sys.argv[1:]
if os.path.exists(path):
    source = path
elif os.path.exists(example):
    source = example
else:
    source = None
text = open(source).read() if source else ""
lines = text.splitlines()
changed = source != path
for pair in pairs:
    key, sep, value = pair.partition("=")
    if not sep:
        value = secrets.token_urlsafe(32)
    pattern = re.compile(r"\s*(?:export\s+)?" + re.escape(key) + r"\s*=(.*)")
    matches = [i for i, line in enumerate(lines) if pattern.fullmatch(line)]
    if matches:
        # The last assignment is the one that takes effect.
        current = pattern.fullmatch(lines[matches[-1]]).group(1).strip()
        if current.strip("\"'"):
            continue
        lines[matches[-1]] = f"{key}={value}"
    else:
        lines.append(f"{key}={value}")
    changed = True
    print(f"{path}: set {key}")
if changed:
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.replace(tmp, path)
os.chmod(path, 0o600)
endef
export SET_ENV_KEYS
