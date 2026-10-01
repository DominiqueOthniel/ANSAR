-- Ajout des champs supplémentaires pour le registre TJK

ALTER TABLE tjk_operations
  ADD COLUMN IF NOT EXISTS "soldeAnterieur" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nombreCamions" NUMERIC(6, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tonnageTotal" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "qtfs" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tonnage" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "resteAPayer" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "prixTransport" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalTransport" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "telChauffeur" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "prixVoyage" NUMERIC(15, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalPalemarr" NUMERIC(15, 2) DEFAULT 0;

COMMENT ON COLUMN tjk_operations."soldeAnterieur" IS 'Solde antérieur du client';
COMMENT ON COLUMN tjk_operations."nombreCamions" IS 'Nombre de camions';
COMMENT ON COLUMN tjk_operations."tonnageTotal" IS 'Tonnage total';
COMMENT ON COLUMN tjk_operations."qtfs" IS 'QTFS';
COMMENT ON COLUMN tjk_operations."tonnage" IS 'Tonnage';
COMMENT ON COLUMN tjk_operations."resteAPayer" IS 'Reste à payer';
COMMENT ON COLUMN tjk_operations."prixTransport" IS 'Prix du transport';
COMMENT ON COLUMN tjk_operations."totalTransport" IS 'Total transport';
COMMENT ON COLUMN tjk_operations."telChauffeur" IS 'Téléphone du chauffeur';
COMMENT ON COLUMN tjk_operations."prixVoyage" IS 'Prix du voyage';
COMMENT ON COLUMN tjk_operations."totalPalemarr" IS 'Total Palemarr';
