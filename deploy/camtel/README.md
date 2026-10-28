# SIA-ANSAR — Full VPS Camtel (Docker)

**Cible** : tout sur le VPS Camtel (front + API + Postgres).  
Plan détaillé : **[PLAN-FULL-VPS.md](./PLAN-FULL-VPS.md)**  
Forfait recommandé : **CB VPS XS** ([hosting.camtel.cm](https://hosting.camtel.cm/#services)).

## Architecture

```
Internet
   │
   ▼
┌──────────────────────────────┐
│  web (Nginx :80)             │
│  /        → React (SPA)      │
│  /api/*   → proxy → api      │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  api (NestJS :3000)          │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  db (Postgres 16)            │
│  profile with-db             │
└──────────────────────────────┘
```

| Service | Rôle |
|---------|------|
| `web` | Front Vite + Nginx |
| `api` | API NestJS (`backend/`) |
| `db` | PostgreSQL 16 (données sur le VPS) |

## Prérequis

- VPS Ubuntu / Debian (Camtel **CB VPS XS**)
- Docker Engine + Compose v2
- Ports **80** (et 443 plus tard) ouverts

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# se reconnecter
docker --version
```

## Déploiement Full VPS

```bash
git clone <url-du-repo> ansar && cd ansar
cp deploy/camtel/.env.example deploy/camtel/.env
nano deploy/camtel/.env   # MOT_DE_PASSE + FRONTEND_URL=http://IP_VPS
chmod +x deploy/camtel/up.sh
./deploy/camtel/up.sh
```

Vérifications :

```bash
curl -s http://127.0.0.1/healthz
curl -s http://127.0.0.1/api/health
```

Ouvrir `http://IP_DU_VPS`.

Après le 1er boot réussi : `DB_SYNCHRONIZE=false` dans `.env`, puis `./deploy/camtel/up.sh`.

## Commandes utiles

```bash
docker compose -f deploy/camtel/docker-compose.yml --env-file deploy/camtel/.env logs -f api
git pull && ./deploy/camtel/up.sh
docker compose -f deploy/camtel/docker-compose.yml --env-file deploy/camtel/.env --profile with-db down
```

## HTTPS (plus tard)

1. DNS A → IP du VPS  
2. Certbot / Caddy  
3. `FRONTEND_URL=https://ton-domaine.cm`

## Fichiers

| Chemin | Rôle |
|--------|------|
| `PLAN-FULL-VPS.md` | Plan abonnement + checklist |
| `docker/api.Dockerfile` | Image API |
| `docker/web.Dockerfile` | Image front + Nginx |
| `docker-compose.yml` | Orchestration |
| `nginx/default.conf` | Proxy `/api` |
| `.env.example` | Variables Full VPS |
| `up.sh` | Démarrage |
