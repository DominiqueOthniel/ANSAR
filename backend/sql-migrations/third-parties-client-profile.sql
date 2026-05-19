-- Profil client : sexe, segment, ville, date de naissance (filtres fiche Clients)
ALTER TABLE third_parties ADD COLUMN IF NOT EXISTS sexe VARCHAR(16);
ALTER TABLE third_parties ADD COLUMN IF NOT EXISTS "segmentClient" VARCHAR(32);
ALTER TABLE third_parties ADD COLUMN IF NOT EXISTS ville VARCHAR(128);
ALTER TABLE third_parties ADD COLUMN IF NOT EXISTS "dateNaissance" DATE;
