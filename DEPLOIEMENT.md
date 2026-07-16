# Guide de Déploiement — SIA-ANSAR

## Stack recommandée (0 € hors Supabase)

- **Frontend** : Netlify (gratuit)
- **Backend NestJS** : [Render](https://render.com) free (Frankfurt) — **remplace Koyeb**
- **Base de données** : Supabase (tes projets existants, inchangés)
- **Keep-alive** : UptimeRobot (gratuit) pour éviter la veille Render

> Les données restent dans **Supabase**. Changer d’hôte API (Koyeb → Render) ne touche pas aux tables.

---

## Quitter Koyeb sans perte de données (bascule)

1. Créer le service Render (étape 2) avec la **même** `DATABASE_URL` Supabase que Koyeb.
2. Vérifier `GET https://TON-SERVICE.onrender.com/api/health` → `{"status":"ok",...}`.
3. Sur Netlify, changer `VITE_API_URL` vers l’URL Render (`…/api`), puis **Clear cache and deploy**.
4. Tester login, factures, caisse sur le site Netlify.
5. Seulement ensuite : **suspendre / supprimer** le service Koyeb.
6. En cas de souci : remettre `VITE_API_URL` sur l’ancienne URL Koyeb (rollback immédiat).

---

## Étape 1 — Supabase (déjà en place)

Réutilise le projet existant. Connection string **Transaction pooler** (port **6543**).

```
postgresql://postgres.xxxx:[PASSWORD]@….pooler.supabase.com:6543/postgres
```

Encoder `#` du mot de passe en `%23` si besoin.

---

## Étape 2 — Render (Backend NestJS)

1. [render.com](https://render.com) → **New Web Service** → repo `DominiqueOthniel/ANSAR`
2. Configurer :
   - **Root Directory** : `backend`
   - **Region** : Frankfurt (EU)
   - **Build Command** : `NPM_CONFIG_PRODUCTION=false npm install && npm run build`
   - **Start Command** : `npm run start:prod`
   - **Plan** : Free
3. Variables :
   | Variable | Valeur |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(même URL que sur Koyeb)* |
   | `DB_SYNCHRONIZE` | `false` (déjà en prod) |
   | `FRONTEND_URL` | URL Netlify du client |
   | `PORT` | `3000` |
4. Deploy → copier `https://….onrender.com`
5. Tester `/api/health`

---

## Étape 3 — Netlify (Frontend)

1. Site existant ou **Import from Git** → `DominiqueOthniel/ANSAR`
2. Build : `npm run build` · Publish : `dist`
3. Variable :
   | Variable | Valeur |
   |---|---|
   | `VITE_API_URL` | `https://TON-SERVICE.onrender.com/api` |

En prod, si `VITE_API_URL` est vide, le front utilise `/api` (même origin) — utile seulement si l’API est sur le même domaine.

---

## Étape 4 — CORS

Sur Render, `FRONTEND_URL` = URL exacte Netlify du client (sans slash final).

---

## Étape 5 — UptimeRobot

Monitor HTTP toutes les **5 min** sur :

`https://TON-SERVICE.onrender.com/api/health`

Évite le cold start Render free après inactivité.

---

## Pourquoi pas Nest entier dans Netlify Functions ?

Le backend Nest + dépendances fait ~150 Mo : trop lourd pour le plan Free Netlify Functions (timeout ~10 s + taille).  
**Render free + Netlify front** = stack gratuit fiable, même code Nest, même Supabase.

Une refonte Next.js full (API Routes) reste possible plus tard ; ce n’est pas requis pour couper Koyeb.

---

## Développement local

```bash
npm install && npm run dev          # front http://localhost:5173 ou 3001
cd backend && npm install && npm run start:dev   # http://localhost:3000/api
```

`VITE_API_URL=http://localhost:3000/api`
