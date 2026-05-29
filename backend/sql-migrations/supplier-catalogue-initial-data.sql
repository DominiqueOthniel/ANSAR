-- Données initiales : catalogue qualité / désignation par fournisseur.
-- À exécuter sur PostgreSQL (Supabase) après modules-articles-clients-chargements.sql.
--
-- Le modèle existant est :
--   articles = désignation / qualité globale
--   article_supplier_prices = disponibilité + prix chez un fournisseur
--
-- Le script est idempotent : il crée les articles manquants, puis rattache les
-- articles aux fournisseurs existants. Les lignes dont le fournisseur n'existe
-- pas encore sont ignorées.

BEGIN;

WITH article_seed(id, libelle, unite, prix_vente) AS (
  VALUES
    ('20000000-0000-4000-8000-000000000001'::uuid, 'Ciment CPJ 35', 'tonne', NULL::numeric),
    ('20000000-0000-4000-8000-000000000002'::uuid, 'Ciment CPA 42.5', 'tonne', NULL::numeric),
    ('20000000-0000-4000-8000-000000000003'::uuid, 'Ciment vrac', 'tonne', NULL::numeric),
    ('20000000-0000-4000-8000-000000000004'::uuid, 'Diesel', 'litre', NULL::numeric),
    ('20000000-0000-4000-8000-000000000005'::uuid, 'Huile moteur 15W40', 'litre', NULL::numeric),
    ('20000000-0000-4000-8000-000000000006'::uuid, 'Pneu 315/80R22.5', 'unité', NULL::numeric),
    ('20000000-0000-4000-8000-000000000007'::uuid, 'Pneu 12R22.5', 'unité', NULL::numeric),
    ('20000000-0000-4000-8000-000000000008'::uuid, 'Vidange moteur', 'forfait', NULL::numeric),
    ('20000000-0000-4000-8000-000000000009'::uuid, 'Révision complète', 'forfait', NULL::numeric),
    ('20000000-0000-4000-8000-000000000010'::uuid, 'Plaquettes de frein', 'jeu', NULL::numeric),
    ('20000000-0000-4000-8000-000000000011'::uuid, 'Filtre à huile', 'unité', NULL::numeric),
    ('20000000-0000-4000-8000-000000000012'::uuid, 'Assurance flotte camion', 'forfait', NULL::numeric),
    ('20000000-0000-4000-8000-000000000013'::uuid, 'Prestation diverse', 'forfait', NULL::numeric)
)
INSERT INTO articles (id, libelle, unite, actif, "prixVente")
SELECT s.id, s.libelle, s.unite, TRUE, s.prix_vente
FROM article_seed s
WHERE NOT EXISTS (
  SELECT 1
  FROM articles a
  WHERE LOWER(TRIM(a.libelle)) = LOWER(TRIM(s.libelle))
);

WITH price_seed(id, fournisseur_nom, article_libelle, prix_unitaire, notes) AS (
  VALUES
    ('21000000-0000-4000-8000-000000000001'::uuid, 'Cimencam — Dépôt Yaoundé', 'Ciment CPJ 35', 92000::numeric, 'Qualité ciment courante'),
    ('21000000-0000-4000-8000-000000000002'::uuid, 'Cimencam — Dépôt Yaoundé', 'Ciment CPA 42.5', 98000::numeric, 'Qualité ciment haute résistance'),
    ('21000000-0000-4000-8000-000000000003'::uuid, 'Cimencam — Dépôt Yaoundé', 'Ciment vrac', 88000::numeric, 'Chargement vrac'),
    ('21000000-0000-4000-8000-000000000004'::uuid, 'Station Shell Bonamoussadi', 'Diesel', 730::numeric, 'Carburant camion'),
    ('21000000-0000-4000-8000-000000000005'::uuid, 'Station Shell Bonamoussadi', 'Huile moteur 15W40', 3500::numeric, 'Lubrifiant'),
    ('21000000-0000-4000-8000-000000000006'::uuid, 'Pneus Express Afrique', 'Pneu 315/80R22.5', 185000::numeric, 'Pneu poids lourd'),
    ('21000000-0000-4000-8000-000000000007'::uuid, 'Pneus Express Afrique', 'Pneu 12R22.5', 170000::numeric, 'Pneu poids lourd'),
    ('21000000-0000-4000-8000-000000000008'::uuid, 'Garage Mécanique Sud', 'Vidange moteur', 45000::numeric, 'Entretien courant'),
    ('21000000-0000-4000-8000-000000000009'::uuid, 'Garage Mécanique Sud', 'Révision complète', 150000::numeric, 'Révision mécanique'),
    ('21000000-0000-4000-8000-000000000010'::uuid, 'Pièces Auto Lourd CM', 'Plaquettes de frein', 95000::numeric, 'Pièces de freinage'),
    ('21000000-0000-4000-8000-000000000011'::uuid, 'Pièces Auto Lourd CM', 'Filtre à huile', 18000::numeric, 'Pièce consommable'),
    ('21000000-0000-4000-8000-000000000012'::uuid, 'Assurances Africaines SA', 'Assurance flotte camion', 320000::numeric, 'Police flotte'),
    ('21000000-0000-4000-8000-000000000013'::uuid, 'Hôtel Sawa — Services généraux', 'Prestation diverse', 25000::numeric, 'Services généraux')
)
INSERT INTO article_supplier_prices (id, "articleId", "fournisseurId", "prixUnitaire", notes)
SELECT
  ps.id,
  a.id,
  f.id,
  ps.prix_unitaire,
  ps.notes
FROM price_seed ps
JOIN articles a
  ON LOWER(TRIM(a.libelle)) = LOWER(TRIM(ps.article_libelle))
JOIN third_parties f
  ON LOWER(TRIM(f.nom)) = LOWER(TRIM(ps.fournisseur_nom))
 AND f.type = 'fournisseur'
ON CONFLICT ("articleId", "fournisseurId") DO UPDATE
SET
  "prixUnitaire" = EXCLUDED."prixUnitaire",
  notes = EXCLUDED.notes;

COMMIT;
