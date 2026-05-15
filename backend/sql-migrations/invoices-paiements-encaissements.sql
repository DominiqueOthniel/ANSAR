-- Ventilation des encaissements par payeur (factures trajet multi-clients).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paiementsEncaissements" JSONB;

COMMENT ON COLUMN invoices."paiementsEncaissements" IS 'Tableau JSON [{ montant, clientTierId?, payeurLibelle? }] — somme des montants = montantPaye lorsque renseigné.';
