-- Lien opération TJK ↔ bon de chargement (ventilation mode TJK).

ALTER TABLE tjk_operations
  ADD COLUMN IF NOT EXISTS "supplierLoadingId" UUID REFERENCES supplier_loadings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tjk_operations_supplier_loading
  ON tjk_operations ("supplierLoadingId");

COMMENT ON COLUMN tjk_operations."supplierLoadingId" IS
  'Bon supplier_loadings (modeEntree = tjk) ventilé vers ce client.';
