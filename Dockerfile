# CS League — imagem de produção (API + frontend estático)
# Usado pelo serviço principal na Railway.

# --- Frontend (Angular) ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY Frontend/package*.json ./
RUN npm ci
COPY Frontend/ ./
RUN npm run build

# --- Backend (TypeScript) ---
FROM node:20-alpine AS backend-build
WORKDIR /app
RUN apk add --no-cache openssl
COPY Backend/package*.json ./
COPY Backend/prisma ./prisma/
RUN npm ci
COPY Backend/ ./
RUN npm run build

# --- Runtime ---
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY Backend/package*.json ./
COPY Backend/prisma ./prisma/
RUN npm ci --omit=dev && npm install --no-save prisma@^6.1.0 && npx prisma generate

COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /app/frontend/dist/cs-league/browser ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]
