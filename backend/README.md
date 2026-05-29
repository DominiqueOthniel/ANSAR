# SIA-ANSAR – API NestJS

Backend REST pour l’application SIA-ANSAR (gestion de flotte, trajets, chauffeurs, dépenses, factures, banque).

## Prérequis

- **Node.js** 18+
- **PostgreSQL** 14+ (ou **Docker Desktop** pour la base ci-dessous)
- **npm** ou **yarn**

## PostgreSQL avec Docker (recommandé en local)

À la racine du dépôt (dossier parent de `backend/`) :

```bash
docker compose up -d
```

Puis dans `backend/.env` : `USE_SQLITE=false` et les variables `DB_*` ci-dessous (ou `DATABASE_URL`).

## Développement sans Docker (SQLite)

Si `USE_SQLITE=true` dans `.env` (sans `DATABASE_URL`), l’API utilise le fichier **`dev.sqlite`** dans `backend/` (package `sql.js`). Aucun PostgreSQL requis. À réserver au **développement** ; en production utiliser PostgreSQL et `USE_SQLITE=false`.

## Installation

```bash
cd backend
npm install
```

## Configuration

1. Copier le fichier d’exemple d’environnement :

```bash
cp .env.example .env
```

2. Créer la base PostgreSQL :

```sql
CREATE DATABASE truck_track;
```

3. Ajuster les variables dans `.env` (connexion DB, port, CORS).

## Lancement

```bash
# Développement (watch)
npm run start:dev

# Production
npm run build
npm run start:prod
```

L’API est disponible sur **http://localhost:3000/api**.

## Endpoints

| Ressource       | GET (liste)     | GET (un)       | POST (créer) | PATCH (modifier) | DELETE |
|----------------|-----------------|----------------|--------------|-------------------|--------|
| Camions        | `/api/trucks`   | `/api/trucks/:id` | POST        | PATCH             | DELETE |
| Chauffeurs     | `/api/drivers`  | `/api/drivers/:id` | POST       | PATCH             | DELETE |
| Trajets        | `/api/trips`    | `/api/trips/:id`   | POST        | PATCH             | DELETE |
| Dépenses       | `/api/expenses` | `/api/expenses/:id` | POST       | PATCH             | DELETE |
| Factures       | `/api/invoices` | `/api/invoices/:id` | POST       | PATCH             | DELETE |
| Tiers          | `/api/third-parties` | `/api/third-parties/:id` | POST | PATCH        | DELETE |
| Comptes bancaires | `/api/bank/accounts` | `/api/bank/accounts/:id` | POST | PATCH   | DELETE |
| Transactions bancaires | `/api/bank/transactions` | `/api/bank/transactions/:id` | POST | PATCH | DELETE |

Les IDs sont des **UUID**.

## Base de données

- **ORM** : TypeORM  
- **Synchronisation** : en développement `synchronize: true` crée/met à jour les tables.  
- **Production** : mettre `synchronize: false` et utiliser les migrations TypeORM.

## Lier le frontend

Dans le frontend React, configurer l’URL de l’API (ex. variable d’environnement `VITE_API_URL=http://localhost:3000/api`) et remplacer les appels au `localStorage` par des appels `fetch` ou un client HTTP vers ces endpoints.
