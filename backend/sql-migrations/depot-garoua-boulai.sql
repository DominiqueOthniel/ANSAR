-- Dépôt ciment Garoua-Boulai (safe house) : mouvements entrée / retrait.

CREATE TABLE IF NOT EXISTS depot_garoua_boulai_movements (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  "truckId" UUID REFERENCES trucks(id) ON DELETE SET NULL,
  "camionImmatriculation" VARCHAR(32),
  type VARCHAR(16) NOT NULL CHECK (type IN ('entree', 'retrait')),
  quantite NUMERIC(12, 2) NOT NULL CHECK (quantite > 0),
  "stockFinal" NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  utilisateur VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_depot_gb_movements_date
  ON depot_garoua_boulai_movements (date DESC, created_at DESC);

COMMENT ON TABLE depot_garoua_boulai_movements IS
  'Mouvements de stock ciment au dépôt Garoua-Boulai (entrées et retraits).';
