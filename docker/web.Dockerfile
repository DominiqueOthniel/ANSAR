# Front Vite → fichiers statiques servis par Nginx (reverse proxy /api).
# Contexte de build : racine du dépôt.
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Sources front (voir .dockerignore pour exclure node_modules, backend dist, etc.)
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY tailwind.config.ts postcss.config.js components.json ./
COPY public ./public
COPY src ./src

# same = le navigateur appelle /api sur le même domaine (Nginx proxy).
ARG VITE_API_URL=same
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY deploy/camtel/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
