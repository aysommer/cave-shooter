# Game client: built with Vite, served as static files by nginx.
# The signaling URL defaults to /peerjs on the same origin (behind Caddy),
# so one image works for any domain.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the signal server's own dependencies are not needed here.
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY index.html vite.config.js ./
COPY src ./src
ARG VITE_SIGNAL_URL=
ENV VITE_SIGNAL_URL=$VITE_SIGNAL_URL
RUN npx vite build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
