ALTER TABLE caisse_transactions
ADD COLUMN IF NOT EXISTS "modePaiement" VARCHAR(80);
