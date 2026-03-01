# ── Backend Dockerfile ──────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install deps first (layer cache)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]