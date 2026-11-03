# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.21.0

# ---- Dependencies (dev + prod) ----
FROM node:${NODE_VERSION}-slim AS deps

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

# ---- Development (used by docker-compose.dev.yml) ----
# Source is bind mounted over /app by compose; node_modules stays in the image
# so the host's macOS binaries never reach the container.
FROM deps AS dev

ENV HOST=0.0.0.0 \
    PORT=3000
EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# ---- Production build ----
FROM deps AS build

COPY . .
RUN npm run build

# ---- Production runtime ----
FROM node:${NODE_VERSION}-slim AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev \
    && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# srvx serves the TanStack Start fetch handler and the static client bundle.
CMD ["node_modules/.bin/srvx", "serve", "--prod", "--host", "0.0.0.0", "--port", "3000", "--static", "/app/dist/client", "--entry", "/app/dist/server/server.js"]
