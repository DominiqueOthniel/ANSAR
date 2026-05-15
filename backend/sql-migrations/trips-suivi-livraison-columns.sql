-- Colonnes optionnelles suivi livraison ciment (réf. ATC, destinataire, quantité, retour bordereaux)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS "referenceAtc" VARCHAR(64);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS destinataire VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS "quantiteChargee" DECIMAL(12, 2);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS "retourBordereaux" VARCHAR(32);
