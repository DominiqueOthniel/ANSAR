-- Lien optionnel mission flotte ↔ bon de chargement.
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS "supplierLoadingId" UUID;

CREATE INDEX IF NOT EXISTS idx_trips_supplier_loading
  ON trips ("supplierLoadingId")
  WHERE "supplierLoadingId" IS NOT NULL;
