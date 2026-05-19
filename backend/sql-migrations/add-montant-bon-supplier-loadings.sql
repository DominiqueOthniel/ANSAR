-- Valeur du bon (FCFA) sur les chargements fournisseur
ALTER TABLE supplier_loadings
  ADD COLUMN IF NOT EXISTS "montantBon" DECIMAL(14, 2);
