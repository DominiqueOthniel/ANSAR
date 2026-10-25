# Déploiement SIA-ANSAR

## Stack actuelle (prod)

| Couche | Où |
|--------|-----|
| Front (Vite) | **Netlify** (prod actuelle — ne pas couper) |
| API | **Netlify Functions** (`/api/*` → `server/`) |
| Données | **Supabase** (Postgres) |

## Alternative Vercel (préparation, sans couper Netlify)

Même code API (`server/`) + front Vite. Config : `vercel.json`, handlers `api/`.

### Import sur Vercel

1. **Ne pas** choisir « Import multi-service » (ignore le prompt `render.yaml`).
2. Sur la ligne **Vite** → **Import single project** (racine du repo).
3. Framework : Vite (détecté via `vercel.json`).
4. Variables d’environnement (Project → Settings → Environment Variables) :

| Variable | Valeur |
|----------|--------|
| `DATABASE_URL` | **même** URL Supabase pooler (port **6543**) que Netlify |
| `FRONTEND_URL` | URL Vercel du projet (ex. `https://xxx.vercel.app`) — à mettre à jour après le 1er deploy |
| `VITE_API_URL` | `same` (ou vide) |
| `ADDITIONAL_CORS_ORIGINS` | optionnel ; `*.vercel.app` est déjà autorisé dans `server/http.cjs` |

5. Deploy. Vérifier : `https://TON-PROJET.vercel.app/api/health` → `"runtime":"vercel"`.
6. Remettre `FRONTEND_URL` sur l’URL définitive puis redeploy si besoin.

**Netlify reste la prod** tant que vous ne changez pas le DNS / le domaine principal. Vercel sert de second déploiement (test / bascule plus tard).

Build local : `npm run build:vercel`.

## Alternative VPS Camtel (Docker)

Voir **[deploy/camtel/README.md](deploy/camtel/README.md)** : Nginx + API Nest + Postgres optionnel.

```bash
cp deploy/camtel/.env.example deploy/camtel/.env
./deploy/camtel/up.sh
```

---

## Variables Netlify (Site → Environment variables)

| Variable | Valeur |
|----------|--------|
| `DATABASE_URL` | URL Supabase **pooler port 6543** (même qu’avant) |
| `FRONTEND_URL` | `https://ton-site.netlify.app` |
| `VITE_API_URL` | `same` (ou vide) → le front appelle `/api` sur le même domaine |

Les **utilisateurs** (admin, gestionnaire, etc.) sont en base (`app_users`), plus en localStorage. La table est créée automatiquement au premier appel API ; migration optionnelle : `backend/sql-migrations/app-users.sql`.

Optionnel : `ADDITIONAL_CORS_ORIGINS` si besoin.

Puis **Clear cache and deploy**.

---

## Vérifications

1. `https://ton-site.netlify.app/api/health` → `"runtime":"netlify-functions"` + liste `capabilities`
2. Connexion app, camions, caisse, commandes…
3. Quand tout est OK : **désactiver / supprimer** l’ancien service Koyeb (plus utilisé)

---

## Données

Rien n’est migré hors de Supabase : même `DATABASE_URL` = **aucune perte de données**.

---

## Dev local

```bash
# Front
VITE_API_URL=http://localhost:3000/api npm run dev

# Option A — Nest local (backend/)
cd backend && npm run start:dev

# Option B — simuler Netlify Functions
npx netlify dev
```

---

## Limites Free Netlify

- Timeout Function ~10 s (exports très lourds à surveiller)
- Cold start possible sur la 1ʳᵉ requête après inactivité

> Prod actuelle = **Netlify Pro** : timeouts / quotas plus confortables. La section Free reste une référence de plan inférieur.
