# Build a partir da raiz: docker build -f Backend/Dockerfile .
FROM node:20-alpine

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

RUN node ../scripts/generate-version.mjs && npm run build && npx prisma generate

ENV NODE_ENV=production
RUN npm prune --production && npm install --no-save prisma@^6.1.0

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
