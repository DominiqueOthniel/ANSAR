-- Registre opérations Camrail (wagons / chargements ferroviaires).

CREATE TABLE IF NOT EXISTS camrail_operations (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  "camionNom" VARCHAR(64),
  "camionImmatriculation" VARCHAR(64),
  quantite NUMERIC(12, 2) NOT NULL DEFAULT 0,
  "typeProduit" VARCHAR(200),
  "referenceAtc" VARCHAR(120),
  "atComplement" NUMERIC(12, 2),
  destinataire VARCHAR(300),
  "dateChargement" DATE,
  "dateLivraison" DATE,
  "numeroWagon" VARCHAR(64),
  commentaires TEXT,
  transporteur VARCHAR(200),
  notes TEXT,
  utilisateur VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camrail_operations_date ON camrail_operations (date DESC, created_at DESC);

COMMENT ON TABLE camrail_operations IS
  'Registre des opérations Camrail (wagons, chargement, livraison, transporteur).';
