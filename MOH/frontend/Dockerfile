# syntax=docker/dockerfile:1

# --- Stage 1: build the static bundle ---------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# VITE_API_BASE_URL is compiled INTO the static JS bundle at build time
# (that's how Vite env vars work — there's no server-side runtime to read
# an env var from once this is static files behind nginx), so it has to be
# a build ARG, not a docker-compose environment: entry on the frontend
# service. Passing --build-arg is how docker-compose.yml supplies it.
ARG VITE_API_BASE_URL=http://localhost:5000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# --- Stage 2: serve the static bundle with nginx ----------------------------
FROM nginx:1.27-alpine AS runtime

# Custom config adds the SPA fallback (every unknown path serves
# index.html so React Router's client-side routes work on a hard
# refresh/direct link) and a couple of headers appropriate for a
# health-data-adjacent app — the nginx image's default config has neither.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
