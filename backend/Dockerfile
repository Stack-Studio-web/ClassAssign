# ── Backend Dockerfile ──────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

RUN addgroup -g 1001 appgroup && adduser -S -u 1001 -G appgroup appuser

COPY package*.json ./
RUN npm ci --omit=dev && chown -R appuser:appgroup /app

COPY --chown=appuser:appgroup . .

RUN mkdir -p uploads && chown appuser:appgroup uploads

USER appuser
EXPOSE 5000

CMD ["node", "server.js"]
