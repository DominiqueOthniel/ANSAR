-- Modules : articles, qualités marchandise, commandes/livraisons clients, chargements fournisseur
-- À exécuter sur PostgreSQL (Supabase) si DB_SYNCHRONIZE=false en production.
-- Sinon, un déploiement avec DB_SYNCHRONIZE=true crée ces tables automatiquement.

CREATE TABLE IF NOT EXISTS merchandise_qualities (
  id UUID PRIMARY KEY,
  libelle VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY,
  libelle VARCHAR(255) NOT NULL,
  unite VARCHAR(64) NOT NULL DEFAULT 'unité',
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  "prixVente" DECIMAL(15, 2),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS article_supplier_prices (
  id UUID PRIMARY KEY,
  "articleId" UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  "fournisseurId" UUID NOT NULL REFERENCES third_parties(id),
  "prixUnitaire" DECIMAL(15, 2) NOT NULL,
  notes VARCHAR(255),
  UNIQUE ("articleId", "fournisseurId")
);

CREATE TABLE IF NOT EXISTS client_orders (
  id UUID PRIMARY KEY,
  "clientId" UUID NOT NULL REFERENCES third_parties(id),
  "articleId" UUID REFERENCES articles(id),
  "invoiceId" UUID,
  reference VARCHAR(64),
  designation VARCHAR(255) NOT NULL,
  destination VARCHAR(255),
  montant DECIMAL(15, 2),
  "prixUnitaire" DECIMAL(15, 2),
  quantite DECIMAL(12, 2),
  unite VARCHAR(64),
  statut VARCHAR(32) NOT NULL,
  "dateCommande" DATE NOT NULL,
  "dateLivraisonSouhaitee" DATE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS client_deliveries (
  id UUID PRIMARY KEY,
  "clientOrderId" UUID NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
  "clientId" UUID NOT NULL REFERENCES third_parties(id),
  "invoiceId" UUID,
  "lieuLivraison" VARCHAR(255) NOT NULL,
  statut VARCHAR(32) NOT NULL,
  "datePrevue" DATE,
  "dateLivraison" DATE,
  "chauffeurId" UUID,
  "tracteurId" UUID,
  "montantTransport" DECIMAL(15, 2),
  "transportFactureParFournisseur" BOOLEAN NOT NULL DEFAULT FALSE,
  "transportFournisseurId" UUID REFERENCES third_parties(id),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS supplier_loadings (
  id UUID PRIMARY KEY,
  "fournisseurId" UUID NOT NULL REFERENCES third_parties(id),
  "numeroBon" VARCHAR(64),
  "articleId" UUID REFERENCES articles(id),
  designation VARCHAR(255) NOT NULL,
  quantite DECIMAL(12, 2),
  unite VARCHAR(64),
  "montantBon" DECIMAL(14, 2),
  "dateChargement" DATE NOT NULL,
  "dateLivraison" DATE,
  statut VARCHAR(32) NOT NULL,
  "modeEntree" VARCHAR(32) NOT NULL DEFAULT 'bon_simple',
  "camionId" UUID REFERENCES trucks(id),
  "hubArrivee" VARCHAR(255),
  "dateArriveeHub" DATE,
  lieu VARCHAR(255),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS supplier_loading_assignments (
  id UUID PRIMARY KEY,
  "loadingId" UUID NOT NULL REFERENCES supplier_loadings(id) ON DELETE CASCADE,
  "clientOrderId" UUID NOT NULL REFERENCES client_orders(id),
  "quantiteAffectee" DECIMAL(12, 2),
  notes TEXT
);
