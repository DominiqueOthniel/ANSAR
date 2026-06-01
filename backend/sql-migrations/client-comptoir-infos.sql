-- Infos complémentaires pour les clients comptoir/passagers.
-- À exécuter sur PostgreSQL (Supabase) si DB_SYNCHRONIZE=false.

ALTER TABLE client_orders
  ADD COLUMN IF NOT EXISTS "clientTelephone" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "clientAdresse" VARCHAR(255);

ALTER TABLE client_deliveries
  ADD COLUMN IF NOT EXISTS "clientTelephone" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "clientAdresse" VARCHAR(255);

COMMENT ON COLUMN client_orders."clientTelephone" IS 'Téléphone du client comptoir/passager sans fiche tiers';
COMMENT ON COLUMN client_orders."clientAdresse" IS 'Adresse ou informations du client comptoir/passager sans fiche tiers';
COMMENT ON COLUMN client_deliveries."clientTelephone" IS 'Téléphone du client comptoir/passager sans fiche tiers';
COMMENT ON COLUMN client_deliveries."clientAdresse" IS 'Adresse ou informations du client comptoir/passager sans fiche tiers';
