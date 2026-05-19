-- Hub / CAMRAIL : mode d'entrée sur les bons, mode de sortie sur les livraisons
-- À exécuter sur PostgreSQL (Supabase) si DB_SYNCHRONIZE=false.

ALTER TABLE supplier_loadings
  ADD COLUMN IF NOT EXISTS "modeEntree" VARCHAR(16) NOT NULL DEFAULT 'camion';

ALTER TABLE supplier_loadings
  ADD COLUMN IF NOT EXISTS "hubArrivee" VARCHAR(255);

ALTER TABLE supplier_loadings
  ADD COLUMN IF NOT EXISTS "dateArriveeHub" DATE;

ALTER TABLE client_deliveries
  ADD COLUMN IF NOT EXISTS "modeSortie" VARCHAR(32) NOT NULL DEFAULT 'livraison_directe';

COMMENT ON COLUMN supplier_loadings."modeEntree" IS 'camion | rail | autre';
COMMENT ON COLUMN supplier_loadings."hubArrivee" IS 'Ex. CAMRAIL Abidjan';
COMMENT ON COLUMN client_deliveries."modeSortie" IS 'retrait_hub | livraison_agent | livraison_directe';
