-- Prix au tonnage pour destinations TJK (montant final = tonnage × prixTonnage).

ALTER TABLE tjk_destinations
  ADD COLUMN IF NOT EXISTS "prixTonnage" NUMERIC(14, 2);

COMMENT ON COLUMN tjk_destinations."prixTonnage" IS 'Prix du tonnage (FCFA / t)';
