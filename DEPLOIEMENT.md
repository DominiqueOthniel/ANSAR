# Guide de Déploiement — ANSAR

## Stack de production
- **Frontend** : Netlify (gratuit)
- **Backend** : Render Frankfurt (gratuit avec veille)
- **Base de données** : Supabase EU (gratuit, 500MB)
- **Keep-alive** : UptimeRobot (gratuit, évite la veille Render)

---

## Étape 1 — Supabase (Base de données)

1. Aller sur [supabase.com](https://supabase.com) → **New Project**
2. Choisir la région : **Frankfurt (EU Central)**
3. Donner un mot de passe fort à la base
4. Attendre la création (~2 minutes)
5. Aller dans **Project Settings → Database → Connection string**
6. Choisir **URI** (mode Transaction Pooler - port 6543)
7. Copier l'URL — elle ressemble à :
   ```
   postgresql://postgres.xxxx:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
8. Garder cette URL pour l'étape suivante

---

## Étape 2 — Render (Backend NestJS)

1. Aller sur [render.com](https://render.com) → **New Web Service**
2. Connecter ton repo GitHub : `DominiqueOthniel/truck-track`
3. Configurer :
   - **Root Directory** : `backend`
   - **Region** : **Frankfurt (EU)**
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm run start:prod`
   - **Plan** : Free
4. Ajouter les **Environment Variables** :
   | Variable | Valeur |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(l'URL Supabase copiée à l'étape 1)* |
   | `DB_SYNCHRONIZE` | `true` *(mettre `false` après le 1er déploiement)* |
   | `FRONTEND_URL` | *(l'URL Netlify — à remplir après l'étape 3)* |
   | `PORT` | `3000` |
5. Cliquer **Deploy** → attendre ~3-5 minutes
6. Copier l'URL du service : `https://truck-track-api.onrender.com`

> ⚠️ Après le premier déploiement réussi, repasser `DB_SYNCHRONIZE` à `false` dans les variables Render.

---

## Étape 3 — Netlify (Frontend React)

1. Aller sur [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Connecter le repo GitHub : `DominiqueOthniel/truck-track`
3. Configurer :
   - **Base directory** : *(laisser vide — racine du repo)*
   - **Build command** : `npm run build`
   - **Publish directory** : `dist`
4. Ajouter la **variable d'environnement** :
   | Variable | Valeur |
   |---|---|
   | `VITE_API_URL` | `https://truck-track-api.onrender.com/api` |
5. Cliquer **Deploy site**
6. Copier l'URL Netlify : `https://truck-track-xxx.netlify.app`

---

## Étape 4 — Finaliser le CORS sur Render

1. Retourner sur Render → ton service backend
2. Dans **Environment Variables**, mettre à jour :
   | Variable | Valeur |
   |---|---|
   | `FRONTEND_URL` | `https://truck-track-xxx.netlify.app` |
3. Render redéploie automatiquement

---

## Étape 5 — UptimeRobot (Éviter la veille Render)

1. Aller sur [uptimerobot.com](https://uptimerobot.com) → créer un compte gratuit
2. **New Monitor** :
   - Type : **HTTP(s)**
   - Name : `ANSAR API`
   - URL : `https://truck-track-api.onrender.com/api/health`
   - Interval : **5 minutes**
3. Sauvegarder → ton backend ne dormira plus jamais ✅

---

## Récapitulatif des URLs finales

```
Frontend  : https://truck-track-xxx.netlify.app
Backend   : https://truck-track-api.onrender.com/api
Health    : https://truck-track-api.onrender.com/api/health
```

---

## Développement local

```bash
# Frontend
npm install
npm run dev          # http://localhost:3001

# Backend
cd backend
npm install
npm run start:dev    # http://localhost:3000/api
```

Copier les fichiers `.env.example` en `.env` et remplir les valeurs.
