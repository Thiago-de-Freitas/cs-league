# Backend API — Railway Root Directory = Backend
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

ARG BUILD_TIME
ARG BUILD_DIRTY
ENV BUILD_TIME=${BUILD_TIME} \
    BUILD_DIRTY=${BUILD_DIRTY:-false} \
    REPO_ROOT=/app

RUN npm run build && npx prisma generate

ENV NODE_ENV=production
RUN npm prune --production && npm install --no-save prisma@^6.1.0

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
