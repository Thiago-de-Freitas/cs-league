# Gamers League — imagem de produção (API + frontend estático)
# Build a partir da raiz do repositório: docker build -f Dockerfile .

# --- Frontend (Angular) ---
FROM node:20-alpine AS frontend-build
WORKDIR /repo
COPY scripts ./scripts
COPY Backend/package.json ./Backend/package.json
COPY Frontend/package*.json ./Frontend/
WORKDIR /repo/Frontend
RUN npm ci
COPY Frontend/ ./
ARG GIT_COMMIT
ARG GIT_COMMIT_FULL
ARG GIT_BRANCH
ARG BUILD_TIME
ARG BUILD_DIRTY
ENV GIT_COMMIT=${GIT_COMMIT} \
    GIT_COMMIT_FULL=${GIT_COMMIT_FULL} \
    GIT_BRANCH=${GIT_BRANCH} \
    BUILD_TIME=${BUILD_TIME} \
    BUILD_DIRTY=${BUILD_DIRTY} \
    REPO_ROOT=/repo
RUN node ../scripts/generate-version.mjs && npm run build

# --- Backend (TypeScript) ---
FROM node:20-alpine AS backend-build
WORKDIR /repo
RUN apk add --no-cache openssl
COPY scripts ./scripts
COPY Backend/package*.json ./Backend/
COPY Frontend/package.json ./Frontend/package.json
COPY Backend/prisma ./Backend/prisma/
WORKDIR /repo/Backend
RUN npm ci
COPY Backend/ ./
ARG GIT_COMMIT
ARG GIT_COMMIT_FULL
ARG GIT_BRANCH
ARG BUILD_TIME
ARG BUILD_DIRTY
ENV GIT_COMMIT=${GIT_COMMIT} \
    GIT_COMMIT_FULL=${GIT_COMMIT_FULL} \
    GIT_BRANCH=${GIT_BRANCH} \
    BUILD_TIME=${BUILD_TIME} \
    BUILD_DIRTY=${BUILD_DIRTY} \
    REPO_ROOT=/repo
RUN node ../scripts/generate-version.mjs && npm run build

# --- Runtime ---
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY Backend/package*.json ./
COPY Backend/prisma ./prisma/
RUN npm ci --omit=dev && npm install --no-save prisma@^6.1.0 && npx prisma generate

COPY --from=backend-build /repo/Backend/dist ./dist
COPY --from=frontend-build /repo/Frontend/dist/gamers-league/browser ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]
