-- Rattachement prêt accordé → fiche client (plafonds). À exécuter sur Supabase si synchronize est désactivé.
ALTER TABLE credits ADD COLUMN IF NOT EXISTS "clientTierId" UUID REFERENCES third_parties(id);
CREATE INDEX IF NOT EXISTS idx_credits_client_tier ON credits("clientTierId") WHERE "clientTierId" IS NOT NULL;
