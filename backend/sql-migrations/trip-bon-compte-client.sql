-- =============================================================================
-- Affectation bon via Trajets → compte client (commande + FAC-CMD / encours)
-- À exécuter sur Supabase (SQL Editor) si les colonnes / tables manquent.
-- Idempotent : ADD COLUMN IF NOT EXISTS.
-- =============================================================================

-- 1) Lien mission flotte ↔ bon de chargement
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS "supplierLoadingId" UUID;

CREATE INDEX IF NOT EXISTS idx_trips_supplier_loading
  ON trips ("supplierLoadingId")
  WHERE "supplierLoadingId" IS NOT NULL;

-- 2) Factures rattachées à une fiche client (indispensable pour l’encours)
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS "clientTierId" UUID REFERENCES third_parties(id);

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS "factureClientLibelle" VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_invoices_client_tier
  ON invoices ("clientTierId")
  WHERE "clientTierId" IS NOT NULL;

-- 3) Lien facture ↔ commande client (FAC-CMD)
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS "clientOrderId" UUID;

CREATE INDEX IF NOT EXISTS idx_invoices_client_order
  ON invoices ("clientOrderId")
  WHERE "clientOrderId" IS NOT NULL;

-- 4) Tables chaîne marchandises (si absentes)
CREATE TABLE IF NOT EXISTS client_orders (
  id UUID PRIMARY KEY,
  "clientId" UUID,
  "clientNom" VARCHAR(255),
  "clientTelephone" VARCHAR(64),
  "clientAdresse" TEXT,
  "articleId" UUID,
  reference VARCHAR(128),
  designation VARCHAR(255) NOT NULL,
  destination VARCHAR(255),
  montant DECIMAL(15, 2),
  "prixUnitaire" DECIMAL(15, 2),
  quantite DECIMAL(12, 2),
  unite VARCHAR(32),
  statut VARCHAR(40) NOT NULL DEFAULT 'confirmee',
  "dateCommande" DATE NOT NULL,
  "dateLivraisonSouhaitee" DATE,
  notes TEXT,
  "invoiceId" UUID
);

CREATE TABLE IF NOT EXISTS supplier_loading_assignments (
  id UUID PRIMARY KEY,
  "loadingId" UUID NOT NULL,
  "clientOrderId" UUID NOT NULL,
  "quantiteAffectee" DECIMAL(12, 2),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_sla_loading
  ON supplier_loading_assignments ("loadingId");

CREATE INDEX IF NOT EXISTS idx_sla_order
  ON supplier_loading_assignments ("clientOrderId");
