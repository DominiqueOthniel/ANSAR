-- =============================================================================
-- Migration : tables CAISSE pour Supabase (PostgreSQL)
-- À exécuter si tu as déjà créé le reste du schéma sans ces tables.
--
-- Prérequis : tables bank_accounts et bank_transactions (FK optionnelles).
-- Voir aussi : backend/supabase-schema.sql (sections 10–11 intégrées).
-- =============================================================================

-- Solde initial caisse (une ligne, id = 1)
CREATE TABLE IF NOT EXISTS caisse_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "soldeInitial" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "categoriesDepense" TEXT,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO caisse_config (id, "soldeInitial") VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Mouvements (entrées / sorties)
CREATE TABLE IF NOT EXISTS caisse_transactions (
  id VARCHAR(128) PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('entree', 'sortie')),
  montant DECIMAL(15, 2) NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  categorie VARCHAR(255),
  reference VARCHAR(255),
  "compteBanqueId" UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  "bankTransactionId" UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
  "exclutRevenu" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caisse_transactions_date ON caisse_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_transactions_type ON caisse_transactions(type);
CREATE INDEX IF NOT EXISTS idx_caisse_transactions_reference ON caisse_transactions(reference) WHERE reference IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Supabase : activer RLS et policies (adapter selon ton auth)
-- -----------------------------------------------------------------------------
-- ALTER TABLE caisse_config ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE caisse_transactions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for authenticated" ON caisse_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all for authenticated" ON caisse_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
