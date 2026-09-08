-- Registre opérations TJK (camions partenaires hors flotte Ansar).

CREATE TABLE IF NOT EXISTS tjk_operations (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  "clientId" UUID REFERENCES third_parties(id) ON DELETE SET NULL,
  "clientNom" VARCHAR(200),
  quantite NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unite VARCHAR(32),
  qualite VARCHAR(200),
  destination VARCHAR(300),
  "camionNom" VARCHAR(64),
  "camionImmatriculation" VARCHAR(64),
  "referenceAtc" VARCHAR(120),
  notes TEXT,
  utilisateur VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tjk_operations_date ON tjk_operations (date DESC, created_at DESC);

COMMENT ON TABLE tjk_operations IS
  'Registre des opérations TJK (camions partenaires hors flotte Ansar).';
