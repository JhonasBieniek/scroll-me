# scroll-me API — NestJS + ffmpeg (processamento HLS efêmero na VPS)

# Multi-stage: imagem de produção; desenvolvimento local via docker-compose (target dev)



FROM node:22-alpine AS base

RUN apk add --no-cache ffmpeg

WORKDIR /app



FROM base AS deps

COPY package.json package-lock.json* ./

RUN npm ci --ignore-scripts



FROM deps AS build

COPY . .

RUN npx prisma generate

RUN npm run build



FROM base AS production

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev --ignore-scripts

COPY prisma ./prisma

RUN npx prisma generate

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]



FROM deps AS development

ENV NODE_ENV=development

COPY . .

RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "start:dev"]

