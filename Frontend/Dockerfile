# Frontend Angular — serviço separado na Railway (cs-league-front)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY serve.prod.cjs ./

EXPOSE 4200

CMD ["node", "serve.prod.cjs"]
