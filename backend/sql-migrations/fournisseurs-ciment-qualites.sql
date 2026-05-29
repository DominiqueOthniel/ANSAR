-- Fournisseurs ciment + qualités produit (DANGOTE, MIRACO, CIMAF, CAC, CIMPOR).
-- À exécuter sur PostgreSQL (Supabase) après modules-articles-clients-chargements.sql.
--
-- Modèle :
--   third_parties (type = fournisseur)
--   articles = désignation / qualité
--   article_supplier_prices = catalogue propre à chaque fournisseur
--
-- Prix indicatif à 1 FCFA : remplacez par les tarifs réels dans Articles ou via l'app.

BEGIN;

WITH fournisseurs(id, nom) AS (
  VALUES
    ('30000000-0000-4000-8000-000000000001'::uuid, 'DANGOTE'),
    ('30000000-0000-4000-8000-000000000002'::uuid, 'MIRACO DOUALA'),
    ('30000000-0000-4000-8000-000000000003'::uuid, 'MIRACO FIGUIL'),
    ('30000000-0000-4000-8000-000000000004'::uuid, 'CIMAF'),
    ('30000000-0000-4000-8000-000000000005'::uuid, 'CAC'),
    ('30000000-0000-4000-8000-000000000006'::uuid, 'CIMPOR')
)
INSERT INTO third_parties (id, nom, type, notes)
SELECT id, nom, 'fournisseur', 'Fournisseur ciment — catalogue qualité produit'
FROM fournisseurs f
WHERE NOT EXISTS (
  SELECT 1 FROM third_parties tp
  WHERE LOWER(TRIM(tp.nom)) = LOWER(TRIM(f.nom))
);

WITH articles(id, libelle) AS (
  VALUES
    ('31000000-0000-4000-8000-000000000001'::uuid, 'DANGOTE 42,5R'),
    ('31000000-0000-4000-8000-000000000002'::uuid, 'DANGOTE 32,5R'),
    ('31000000-0000-4000-8000-000000000003'::uuid, 'MIRA 42,5R'),
    ('31000000-0000-4000-8000-000000000004'::uuid, 'MIRA 32,5R'),
    ('31000000-0000-4000-8000-000000000005'::uuid, 'CIMAF 32,5R'),
    ('31000000-0000-4000-8000-000000000006'::uuid, 'CIMAF 42,5R'),
    ('31000000-0000-4000-8000-000000000007'::uuid, 'NONO 42,5R'),
    ('31000000-0000-4000-8000-000000000008'::uuid, 'NONO 32,5R'),
    ('31000000-0000-4000-8000-000000000009'::uuid, 'CIMPOR 32,5R'),
    ('31000000-0000-4000-8000-000000000010'::uuid, 'CIMPOR 42,5R'),
    ('31000000-0000-4000-8000-000000000011'::uuid, 'CIMPOR 52,5R')
)
INSERT INTO articles (id, libelle, unite, actif)
SELECT id, libelle, 'tonne', TRUE
FROM articles a
WHERE NOT EXISTS (
  SELECT 1 FROM articles existing
  WHERE LOWER(TRIM(existing.libelle)) = LOWER(TRIM(a.libelle))
);

WITH attributions(fournisseur_nom, article_libelle) AS (
  VALUES
    ('DANGOTE', 'DANGOTE 42,5R'),
    ('DANGOTE', 'DANGOTE 32,5R'),
    ('MIRACO DOUALA', 'MIRA 42,5R'),
    ('MIRACO DOUALA', 'MIRA 32,5R'),
    ('MIRACO FIGUIL', 'MIRA 42,5R'),
    ('MIRACO FIGUIL', 'MIRA 32,5R'),
    ('CIMAF', 'CIMAF 32,5R'),
    ('CIMAF', 'CIMAF 42,5R'),
    ('CAC', 'NONO 42,5R'),
    ('CAC', 'NONO 32,5R'),
    ('CIMPOR', 'CIMPOR 32,5R'),
    ('CIMPOR', 'CIMPOR 42,5R'),
    ('CIMPOR', 'CIMPOR 52,5R')
)
INSERT INTO article_supplier_prices (
  id,
  "articleId",
  "fournisseurId",
  "prixUnitaire",
  notes
)
SELECT
  gen_random_uuid(),
  a.id,
  f.id,
  1,
  'Prix à renseigner'
FROM attributions x
JOIN third_parties f
  ON LOWER(TRIM(f.nom)) = LOWER(TRIM(x.fournisseur_nom))
 AND f.type = 'fournisseur'
JOIN articles a
  ON LOWER(TRIM(a.libelle)) = LOWER(TRIM(x.article_libelle))
ON CONFLICT ("articleId", "fournisseurId") DO NOTHING;

COMMIT;
