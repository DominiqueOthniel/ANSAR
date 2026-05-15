-- Facturation multi-clients sur un même trajet (montant total facturé ≤ recette du trajet).
-- À exécuter sur Supabase si synchronize est désactivé.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "clientTierId" UUID REFERENCES third_parties(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "factureClientLibelle" VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_invoices_client_tier ON invoices("clientTierId") WHERE "clientTierId" IS NOT NULL;
