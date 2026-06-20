FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run build && npx prisma generate

RUN npm prune --production && npm install --no-save prisma@^6.1.0

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
