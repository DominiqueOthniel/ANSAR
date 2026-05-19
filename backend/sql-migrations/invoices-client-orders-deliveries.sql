-- Factures liées aux commandes / livraisons clients (FAC-CMD, FAC-LIV)
-- À exécuter sur Supabase si PATCH /api/client-orders renvoie 500 après mise à jour.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "clientOrderId" UUID REFERENCES client_orders(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "clientDeliveryId" UUID REFERENCES client_deliveries(id);

CREATE INDEX IF NOT EXISTS idx_invoices_client_order ON invoices("clientOrderId")
  WHERE "clientOrderId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_client_delivery ON invoices("clientDeliveryId")
  WHERE "clientDeliveryId" IS NOT NULL;
