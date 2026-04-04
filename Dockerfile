# ── Estágio 1: Build do frontend com Vite ─────────────────────────
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Estágio 2: Servidor de produção ───────────────────────────────
FROM node:18-slim AS runner
WORKDIR /app

# Instala apenas as dependências de produção (express, helmet, etc.)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o servidor e os arquivos necessários
COPY server.js .
COPY manifest.json .
COPY service-worker.js .
COPY version.json .

# Copia o build gerado pelo Vite
COPY --from=builder /app/dist ./dist

EXPOSE 8080
CMD ["node", "server.js"]
