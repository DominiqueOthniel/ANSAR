# SIA-ANSAR — déploiement Docker sur VPS Camtel

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
      ┌──────┴───────┐
      ▼              ▼
  Supabase       Postgres Docker
  (externe)      (profile with-db)
```

| Service | Rôle |
|---------|------|
| `web` | Front Vite buildé + Nginx (reverse proxy) |
| `api` | API NestJS (même code que `backend/`) |
| `db` | Postgres 16 optionnel (`--profile with-db`) |

## Prérequis VPS Camtel

- Ubuntu / Debian
- Docker Engine + plugin Compose v2
- Ports **80** (et 443 plus tard pour HTTPS) ouverts
- Forfait recommandé : **CB VPS S** (4 Go) ou **M**

Installation Docker (exemple Ubuntu) :

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# se reconnecter en SSH
docker --version
```

## Déploiement

Sur le VPS, depuis la racine du dépôt cloné :

```bash
git clone <url-du-repo> ansar && cd ansar
cp deploy/camtel/.env.example deploy/camtel/.env
nano deploy/camtel/.env
```

Renseigner au minimum :

- `FRONTEND_URL` = `http://IP_DU_VPS` (ou ton domaine)
- `DATABASE_URL` = URL Supabase **ou** URL Postgres local (voir ci-dessous)

Puis :

```bash
chmod +x deploy/camtel/up.sh
./deploy/camtel/up.sh
```

Vérifications :

```bash
curl -s http://127.0.0.1/healthz
curl -s http://127.0.0.1/api/health
```

Ouvrir `http://IP_DU_VPS` dans le navigateur.

## Postgres : Supabase ou local

### A. Supabase (plus simple)

Garde ton `DATABASE_URL` pooler (port 6543). Pas besoin du profile `with-db`.

### B. Postgres sur le VPS

Dans `.env` :

```env
DATABASE_URL=postgresql://ansar:MOT_DE_PASSE_FORT@db:5432/truck_track
POSTGRES_USER=ansar
POSTGRES_PASSWORD=MOT_DE_PASSE_FORT
POSTGRES_DB=truck_track
DB_SYNCHRONIZE=true
```

Le script `up.sh` active automatiquement `--profile with-db` si `DATABASE_URL` contient `@db:`.

Après création des tables, repasser `DB_SYNCHRONIZE=false`.

Migration de données Supabase → VPS : dump/restore `pg_dump` / `psql` (hors scope de ce compose).

## Commandes utiles

```bash
# Logs
docker compose -f deploy/camtel/docker-compose.yml --env-file deploy/camtel/.env logs -f api

# Rebuild après git pull
./deploy/camtel/up.sh

# Arrêt
docker compose -f deploy/camtel/docker-compose.yml --env-file deploy/camtel/.env down
```

## HTTPS (plus tard)

Quand tu as un domaine `.cm` :

1. Pointer le DNS A vers l’IP du VPS
2. Ajouter Certbot / Caddy devant Nginx, ou un reverse proxy hôte
3. Mettre à jour `FRONTEND_URL=https://ton-domaine.cm`

## Plusieurs apps sur le même VPS

Chaque app = un compose (ports différents) ou un Nginx hôte avec `server_name` / sous-domaines (`ansar.domaine.cm`, `autre.domaine.cm`). Sur forfait **S**, viser 1 app + DB externe ; sur **M**, 2 apps possibles.

## Fichiers

| Chemin | Rôle |
|--------|------|
| `docker/api.Dockerfile` | Image API Nest |
| `docker/web.Dockerfile` | Image front + Nginx |
| `deploy/camtel/docker-compose.yml` | Orchestration |
| `deploy/camtel/nginx/default.conf` | Proxy `/api` |
| `deploy/camtel/.env.example` | Variables |
| `deploy/camtel/up.sh` | Démarrage |

Le `Dockerfile` racine (Koyeb / legacy) reste inchangé.
