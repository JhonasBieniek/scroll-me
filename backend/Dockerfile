# scroll-me v2 API — NestJS + ffmpeg (processamento HLS efêmero na VPS)
# Multi-stage: imagem de produção; desenvolvimento local via docker-compose (target dev)

FROM node:22-alpine AS base
RUN apk add --no-cache ffmpeg
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
