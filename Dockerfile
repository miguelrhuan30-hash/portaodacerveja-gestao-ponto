# syntax=docker/dockerfile:1
FROM node:20-alpine

# Diretório de trabalho no container
WORKDIR /app

# Copia apenas os arquivos de dependências primeiro (cache de camadas)
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm ci --only=production

# Copia o restante do código
COPY . .

# Cloud Run usa a porta definida pela variável PORT (padrão 8080)
EXPOSE 8080

# Inicia o servidor Express
CMD ["node", "server.js"]
