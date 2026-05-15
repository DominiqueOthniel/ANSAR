# API NestJS — contexte de build = racine du dépôt (monorepo).
# Sur Koyeb : Dockerfile location = Dockerfile (racine), sans "Root directory" obligatoire.
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ .
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 8000
ENV PORT=8000
CMD ["node", "dist/main.js"]
