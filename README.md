# Production build & run

docker compose up --build

# Development with hot reload

docker compose -f docker-compose.dev.yml up

# Rebuild after dependency changes

docker compose up --build --force-recreate
