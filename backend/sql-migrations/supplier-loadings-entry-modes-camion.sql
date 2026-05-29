-- Modes d'entrée métier sur les bons fournisseur + camion SIA-ANSAR optionnel.
-- À exécuter sur PostgreSQL (Supabase) si DB_SYNCHRONIZE=false.

ALTER TABLE supplier_loadings
  ADD COLUMN IF NOT EXISTS "modeEntree" VARCHAR(32) NOT NULL DEFAULT 'bon_simple';

ALTER TABLE supplier_loadings
  ALTER COLUMN "modeEntree" TYPE VARCHAR(32);

ALTER TABLE supplier_loadings
  ADD COLUMN IF NOT EXISTS "camionId" UUID REFERENCES trucks(id);

ALTER TABLE supplier_loadings
  ADD COLUMN IF NOT EXISTS "dateLivraison" DATE;

COMMENT ON COLUMN supplier_loadings."modeEntree" IS 'bon_simple | camion_ansar | rail | rendu_fournisseur';
COMMENT ON COLUMN supplier_loadings."camionId" IS 'Camion SIA-ANSAR utilisé si modeEntree = camion_ansar';
COMMENT ON COLUMN supplier_loadings."dateLivraison" IS 'Date de livraison prévue ou réalisée du bon fournisseur';
