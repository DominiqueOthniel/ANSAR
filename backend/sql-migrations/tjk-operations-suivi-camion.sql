-- Colonnes suivi camion TJK (tonnage, téléphone chauffeur, prix transport, paiement).

ALTER TABLE tjk_operations
  ADD COLUMN IF NOT EXISTS qtes NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS tonnage NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS "telChauffeur" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "prixTrans" NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS paiement NUMERIC(14, 2);

COMMENT ON COLUMN tjk_operations.qtes IS 'Quantité suivie (souvent égale à quantite).';
COMMENT ON COLUMN tjk_operations.tonnage IS 'Tonnage de l’opération TJK.';
COMMENT ON COLUMN tjk_operations."telChauffeur" IS 'Téléphone du chauffeur partenaire.';
COMMENT ON COLUMN tjk_operations."prixTrans" IS 'Prix transport (FCFA).';
COMMENT ON COLUMN tjk_operations.paiement IS 'Paiement enregistré sur la ligne (FCFA).';
