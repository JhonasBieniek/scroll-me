# scroll-me v2 Frontend — Angular 19
# Multi-stage: imagem de produção; desenvolvimento local via docker-compose (target development)

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 4200
CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--poll", "2000"]
