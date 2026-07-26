ALTER TABLE caisse_transactions
ADD COLUMN IF NOT EXISTS "clientTierId" UUID;
