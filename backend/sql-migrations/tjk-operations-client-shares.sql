-- Ventilation multi-clients d’une opération TJK (parts quantité / montant).

ALTER TABLE tjk_operations
  ADD COLUMN IF NOT EXISTS "clientShares" JSONB;

COMMENT ON COLUMN tjk_operations."clientShares" IS
  'Parts clients (id, clientId, clientNom, quantite, montant) pour ventiler un bon sur plusieurs clients.';
