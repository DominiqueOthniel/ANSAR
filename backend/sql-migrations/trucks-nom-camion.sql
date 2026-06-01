-- Ajoute le nom commercial/interne du camion.
ALTER TABLE IF EXISTS trucks
  ADD COLUMN IF NOT EXISTS nom VARCHAR;
