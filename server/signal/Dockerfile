# Signaling (PeerJS) + ICE/TURN credentials server.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY *.js ./
USER node
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:9000/health >/dev/null || exit 1
CMD ["node", "index.js"]
