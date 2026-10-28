# Plan Full VPS Camtel — SIA-ANSAR

Tout tourne chez Camtel : **front + API + Postgres**.  
Plus de dépendance Netlify / Vercel / Supabase en production.

Réf. catalogue : [hosting.camtel.cm](https://hosting.camtel.cm/#services)

---

## 1. Abonnement à prendre

| Choix | Détail |
|-------|--------|
| **Forfait** | **CB VPS XS** (~12 000–14 500 FCFA / mois) |
| **Ressources** | 4 Go RAM · 1 vCPU · 100 Go HDD · 1 Mbps · 1 IP publique |
| **Pourquoi** | Suffisant pour 1–3 instances métier (empreinte ~150–200 Mo RAM / instance) |
| **Optionnel** | Data Backups / VPS Backups (~10 000 FCFA / 100 Go) — sinon Backup JSON dans l’app |
| **À éviter pour démarrer** | Bare Metal, VPS M+ (trop pour le démarrage) |

---

## 2. Architecture cible

```
Internet
   │
   ▼
┌─────────────────────────────────┐
│  VPS Camtel (Ubuntu)            │
│                                 │
│  Nginx :80/:443                 │
│    /      → front React (SPA)   │
│    /api/* → API NestJS :3000    │
│                                 │
│  PostgreSQL 16 (Docker)         │
│    volume disque persistant     │
└─────────────────────────────────┘
```

| Couche | Où |
|--------|-----|
| Front | Docker `web` (Nginx) |
| API | Docker `api` (NestJS) |
| Base | Docker `db` (Postgres 16, profile `with-db`) |
| Sauvegardes app | Bouton **Backup JSON** dans l’interface |

Fichiers : `deploy/camtel/docker-compose.yml`, `up.sh`, `.env.example`.

---

## 3. Étapes concrètes

### A. Commander le VPS
1. Compte sur [hosting.camtel.cm](https://hosting.camtel.cm/#services)
2. Commander **CB VPS XS**
3. Noter : **IP publique**, login SSH, mot de passe / clé

### B. Préparer le serveur (SSH)
```bash
# Connexion
ssh root@IP_DU_VPS   # ou utilisateur fourni par Camtel

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# se reconnecter

docker --version
docker compose version
```

### C. Déployer ANSAR
```bash
git clone https://github.com/DominiqueOthniel/ANSAR.git ansar
cd ansar
cp deploy/camtel/.env.example deploy/camtel/.env
nano deploy/camtel/.env
```

Contenu minimal `.env` (**Postgres local = full VPS**) :

```env
HTTP_PORT=80
FRONTEND_URL=http://IP_DU_VPS
DATABASE_URL=postgresql://ansar:MOT_DE_PASSE_FORT@db:5432/truck_track
POSTGRES_USER=ansar
POSTGRES_PASSWORD=MOT_DE_PASSE_FORT
POSTGRES_DB=truck_track
DB_SYNCHRONIZE=true
```

Puis :

```bash
chmod +x deploy/camtel/up.sh
./deploy/camtel/up.sh
```

`up.sh` active automatiquement `--profile with-db` si `DATABASE_URL` contient `@db:`.

### D. Vérifier
```bash
curl -s http://127.0.0.1/healthz
curl -s http://127.0.0.1/api/health
```
Navigateur : `http://IP_DU_VPS`

Après création des tables : remettre `DB_SYNCHRONIZE=false` dans `.env` et relancer `./deploy/camtel/up.sh`.

### E. Migrer les données depuis Supabase (si besoin)
Sur une machine qui a accès à l’ancienne base :

```bash
# Dump Supabase (URI pooler ou directe)
pg_dump "$ANCIENNE_DATABASE_URL" --no-owner --format=custom -f ansar.dump

# Restore vers le Postgres du VPS (exposer 5432 temporairement ou via docker exec)
pg_restore -d "postgresql://ansar:MOT@IP_VPS:5432/truck_track" --no-owner ansar.dump
```

Sinon : repartir à zéro + imports / Backup JSON si tu as des exports.

### F. HTTPS (plus tard)
1. Domaine `.cm` → DNS A vers l’IP VPS  
2. Certbot / Caddy devant Nginx  
3. `FRONTEND_URL=https://ton-domaine.cm`

---

## 4. Exploitation courante

```bash
# Logs API
docker compose -f deploy/camtel/docker-compose.yml --env-file deploy/camtel/.env logs -f api

# Mise à jour après git pull
cd ~/ansar && git pull && ./deploy/camtel/up.sh

# Arrêt
docker compose -f deploy/camtel/docker-compose.yml --env-file deploy/camtel/.env --profile with-db down
```

Backup métier : Dashboard app → **Backup** (JSON). Stocker le fichier hors du VPS (Drive, PC).

---

## 5. Limites CB VPS XS

| Point | Impact |
|-------|--------|
| 1 vCPU / 1 Mbps | Usage bureau OK ; pics multi-utilisateurs / gros PDF à surveiller |
| HDD | Plus lent qu’un SSD pour Postgres sous charge |
| Admin | Tu (ou un agent) gères Docker, MAJ, redémarrages |
| Multi-entreprises | 2–3 instances légères OK ; au-delà → VPS M/L |

---

## 6. Checklist go-live

- [ ] CB VPS XS commandé + IP / SSH reçus  
- [ ] Docker installé  
- [ ] Repo cloné + `.env` Postgres local  
- [ ] `./deploy/camtel/up.sh` OK  
- [ ] `/api/health` OK depuis le navigateur  
- [ ] Login + camions / caisse OK  
- [ ] `DB_SYNCHRONIZE=false` après 1er boot  
- [ ] Backup JSON testé  
- [ ] (Optionnel) dump Supabase restauré  
- [ ] (Optionnel) domaine + HTTPS  

---

## 7. Rôle de l’agent Cursor

Une fois SSH + IP disponibles, on peut :
1. Installer Docker  
2. Déployer la stack  
3. Vérifier health / login  
4. Aider au dump/restore Supabase  

Sans accès SSH, le plan s’arrête à la commande du VPS côté Camtel.
