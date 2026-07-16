# Guide de Déploiement — SIA-ANSAR (Cameroun)

## Stack cible (sans Render, sans Koyeb à terme)

| Couche | Hébergeur | Coût |
|--------|-----------|------|
| Front (Vite) | **Netlify** | Gratuit |
| API | **Netlify Functions** (`/api/*`) | Gratuit |
| Base | **Supabase** (inchangée) | Ton plan actuel |

> **Render** n’est pas utilisé (accès Cameroun).  
> **Koyeb** reste en **secours** (`API_FALLBACK_URL`) tant que tous les modules ne sont pas portés.

Les données restent dans **Supabase**. On ne recrée pas la base.

---

## Comment ça marche

1. Le front Netlify appelle `/api/...` (même site).
2. La Function légère (`server/` + `pg`) parle à Supabase.
3. Routes **déjà portées** : health, trucks (CRUD), drivers (lecture), third-parties (lecture).
4. Routes **pas encore portées** : si `API_FALLBACK_URL` = ton Koyeb, la Function **proxy** vers Nest. Sinon → 501.

Quand tout est porté → tu retires `API_FALLBACK_URL` → tu éteins Koyeb.

---

## Variables Netlify (Site settings → Environment)

| Variable | Valeur |
|----------|--------|
| `DATABASE_URL` | Même URL Supabase que Koyeb (pooler **6543**) |
| `FRONTEND_URL` | `https://ton-site.netlify.app` |
| `API_FALLBACK_URL` | `https://ton-service.koyeb.app` (temporaire) |
| `VITE_API_URL` | `same` ou laisser **vide** (même origin `/api`) |

Puis **Clear cache and deploy site**.

---

## Bascule sans perte de données

1. Déployer ce `main` sur Netlify avec `DATABASE_URL` + `API_FALLBACK_URL`.
2. Tester `/api/health` sur le domaine Netlify.
3. Mettre `VITE_API_URL=same` (ou vide) → redeploy front.
4. Tester l’app (camions / chauffeurs / reste via proxy Koyeb).
5. On porte le reste des modules progressivement.
6. Retirer `API_FALLBACK_URL` → couper Koyeb.

Rollback : remettre `VITE_API_URL` sur l’URL Koyeb.

---

## Dev local

```bash
# Front
VITE_API_URL=http://localhost:3000/api npm run dev

# API Nest (secours / dev complet)
cd backend && npm run start:dev
```

Pour tester la Function en local : `npx netlify dev` (CLI Netlify) avec `DATABASE_URL` dans `.env`.

---

## Pourquoi pas Nest entier sur Netlify ?

Nest + TypeORM ≈ 150 Mo → trop lourd / trop lent pour le Free Functions.  
D’où l’API **légère** (`server/`) qui réutilise la **même** base Supabase.
