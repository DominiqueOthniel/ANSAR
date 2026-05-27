-- Client comptoir/passager : opérations client sans fiche tiers enregistrée.
-- À exécuter sur PostgreSQL (Supabase) si DB_SYNCHRONIZE=false.

ALTER TABLE client_orders
  ALTER COLUMN "clientId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "clientNom" VARCHAR(255);

ALTER TABLE client_deliveries
  ALTER COLUMN "clientId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "clientNom" VARCHAR(255);

COMMENT ON COLUMN client_orders."clientNom" IS 'Nom affiché pour une commande client comptoir/passager sans fiche tiers';
COMMENT ON COLUMN client_deliveries."clientNom" IS 'Nom affiché pour une livraison client comptoir/passager sans fiche tiers';
