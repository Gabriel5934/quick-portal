# cielo-mock for tests/test_cielo_mock_integration.py, used only by the test
# stage. `cielo-mock` is a named build context (compose additional_contexts
# in docker-compose.dev.yml, pointing at ../cielo-mock); a plain build of the
# runtime image never reaches this stage, so it does not need that context.
# node:24-slim (Debian, glibc) rather than cielo-mock's node:24-alpine, so the
# node binary also runs in the Debian-based Python test image.
FROM node:24-slim AS cielo-mock-build

WORKDIR /cielo-mock

COPY --from=cielo-mock package.json package-lock.json ./
RUN npm ci

COPY --from=cielo-mock tsconfig.json ./
COPY --from=cielo-mock src ./src
RUN npm run build && npm prune --omit=dev

# Tests and lint (`make test-api`), built only with `--target test`. The
# runtime image is the last stage below, which a plain build produces.
FROM python:3.13.18-slim AS test

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt requirements-dev.txt ./
RUN pip install -r requirements-dev.txt

COPY pyproject.toml alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY tests ./tests

# The integration tests look for the mock at /app/../cielo-mock and run its
# dist/server.js with node from PATH. src/ comes along because they compare
# its mtimes with dist/ to decide whether the build is current.
COPY --from=cielo-mock-build /usr/local/bin/node /usr/local/bin/node
COPY --from=cielo-mock-build /cielo-mock /cielo-mock

CMD ["sh", "-c", "ruff check . && ruff format --check . && pytest -q"]

# Runtime.
FROM python:3.13.18-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Run as an unprivileged user. /app stays owned by root (read-only to the
# app); only /app/data, where the SQLite database lives, is writable.
# /app/data is bind mounted from the host's ./data, and a bind mount keeps
# host ownership, so on the Lightsail host run `chown -R 10001:10001 data`
# in the deploy directory.
RUN groupadd --system --gid 10001 quickapi \
    && useradd --system --uid 10001 --gid 10001 --no-create-home \
       --shell /usr/sbin/nologin quickapi \
    && mkdir -p /app/data \
    && chown -R 10001:10001 /app/data
USER 10001:10001

EXPOSE 8000

# Apply migrations, then serve with exactly one uvicorn worker: SQLite has a
# single writer and the service is sized for one process.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --workers 1"]
