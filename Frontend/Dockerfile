# Frontend Angular — build a partir da raiz: docker build -f Frontend/Dockerfile .
FROM node:20-alpine AS build
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

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY Frontend/package*.json ./
RUN npm ci --omit=dev

COPY --from=build /repo/Frontend/dist ./dist
COPY Frontend/serve.prod.cjs ./

EXPOSE 4200

CMD ["node", "serve.prod.cjs"]
