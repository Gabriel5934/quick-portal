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
RUN groupadd --system --gid 10001 beacon \
    && useradd --system --uid 10001 --gid 10001 --no-create-home \
       --shell /usr/sbin/nologin beacon \
    && mkdir -p /app/data \
    && chown -R 10001:10001 /app/data
USER 10001:10001

EXPOSE 8000

# Apply migrations, then serve with exactly one uvicorn worker: SQLite has a
# single writer and the service is sized for one process.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --workers 1"]
