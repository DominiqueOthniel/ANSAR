# Déploiement SIA-ANSAR — Netlify + Supabase uniquement

## Stack

| Couche | Où |
|--------|-----|
| Front (Vite) | **Netlify** |
| API | **Netlify Functions** (`/api/*` → `server/`) |
| Données | **Supabase** (Postgres) |

**Pas de Koyeb, pas de Render, pas d’autre serveur backend.**

---

## Variables Netlify (Site → Environment variables)

| Variable | Valeur |
|----------|--------|
| `DATABASE_URL` | URL Supabase **pooler port 6543** (même qu’avant) |
| `FRONTEND_URL` | `https://ton-site.netlify.app` |
| `VITE_API_URL` | `same` (ou vide) → le front appelle `/api` sur le même domaine |

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
