-- Inversion des contraintes sur les dates des trajets
-- Date d'arrivée devient obligatoire, date de départ devient optionnelle

-- Étape 1 : Pour les trajets existants sans date d'arrivée, 
-- on met la date de départ comme date d'arrivée temporaire
UPDATE trips 
SET "dateArrivee" = "dateDepart" 
WHERE "dateArrivee" IS NULL;

-- Étape 2 : Rendre dateArrivee obligatoire (NOT NULL)
ALTER TABLE trips 
  ALTER COLUMN "dateArrivee" SET NOT NULL;

-- Étape 3 : Rendre dateDepart optionnelle (permettre NULL)
ALTER TABLE trips 
  ALTER COLUMN "dateDepart" DROP NOT NULL;

-- Commentaires
COMMENT ON COLUMN trips."dateDepart" IS 'Date de départ du trajet (optionnelle)';
COMMENT ON COLUMN trips."dateArrivee" IS 'Date d''arrivée du trajet (obligatoire)';
