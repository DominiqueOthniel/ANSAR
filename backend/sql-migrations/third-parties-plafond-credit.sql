-- Plafond crédits par fiche client (third_parties). À exécuter sur Supabase si synchronize est désactivé.
ALTER TABLE third_parties ADD COLUMN IF NOT EXISTS "plafondCredit" DECIMAL(15, 2);
