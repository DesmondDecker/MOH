# syntax=docker/dockerfile:1

# --- Stage 1: install dependencies -----------------------------------------
# Separated from the runtime stage so the final image never contains
# devDependencies (jest, supertest, mongodb-memory-server, oxlint) or the
# npm cache — those add real size and, for a couple of them, real attack
# surface (a test HTTP server, a downloaded MongoDB binary) that has no
# business being in a production container.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 2: runtime --------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

# Alpine's node:22-alpine image already ships a non-root `node` user
# (uid 1000) — reused here rather than creating a new one, and the app
# runs as that user for the rest of the build, not root.
RUN mkdir -p /app && chown -R node:node /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# .env is deliberately NOT copied in (see .dockerignore) — this image
# expects real config to arrive as container environment variables at
# `docker run` / orchestrator time (see docker-compose.yml `env_file:` or
# your platform's secrets injection), never baked into the image.

USER node

ENV NODE_ENV=production
EXPOSE 5000

# Matches the GET /health route already defined in app.js — used by
# docker-compose's `depends_on: condition: service_healthy` and by any
# orchestrator (ECS, k8s, etc.) doing readiness checks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
