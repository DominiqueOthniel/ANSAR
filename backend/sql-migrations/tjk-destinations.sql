-- Destinations TJK : libellé + montants forfaitaires pour préremplir le formulaire d’opération.

CREATE TABLE IF NOT EXISTS tjk_destinations (
  id UUID PRIMARY KEY,
  libelle VARCHAR(255) NOT NULL,
  "quantiteDefaut" NUMERIC(12, 2),
  "poidsUniteKg" NUMERIC(8, 3) DEFAULT 50,
  "prixTonnage" NUMERIC(14, 2),
  "prixTrans" NUMERIC(14, 2),
  "prixTransport" NUMERIC(14, 2),
  "totalTransport" NUMERIC(14, 2),
  "prixVoyage" NUMERIC(14, 2),
  "totalPaiement" NUMERIC(14, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tjk_destinations_libelle_lower_idx
  ON tjk_destinations (LOWER(TRIM(libelle)));

COMMENT ON TABLE tjk_destinations IS 'Catalogue destinations TJK avec montants forfaitaires';
