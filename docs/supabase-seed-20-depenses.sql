-- =============================================================================
-- 20 dépenses (expenses) — alignées sur les seeds existants
-- ANSAR / Supabase — SQL Editor
--
-- PRÉREQUIS (dans l’ordre recommandé) :
--   1. backend/supabase-schema.sql
--   2. docs/supabase-seed-10-mouvements.sql  (tiers 001–005, chauffeurs, camions, trajets 001–003, dépenses 001–003)
--   3. docs/supabase-seed-20-tiers.sql       (tiers 006–025)
--   4. docs/supabase-seed-10-trajets.sql     (trajets 004–013)
--
-- Références utilisées :
--   camions  : 30000000-0000-4000-8000-000000000001 … 0004 (tracteurs + base remorque)
--   trajets  : 40000000-0000-4000-8000-000000000001 … 0013
--   chauffeurs : 20000000-0000-4000-8000-000000000001 … 0005
--   fournisseurs / tiers : 10000000-0000-4000-8000-000000000003 (Total), 005 (Garage), 006–025
--
-- Nouvelles dépenses : id 50000000-0000-4000-8000-000000000004 … 000023 (20 lignes)
-- Les id 001–003 sont déjà dans supabase-seed-10-mouvements.sql
--
-- Après les INSERT expenses : une sortie caisse par dépense (comme upsertSortieFromExpense
-- dans l’app : id = caisse-dep-<uuid dépense>, reference = depense:<uuid>).
-- PRÉREQUIS : tables caisse_transactions (+ caisse_config) créées (backend/supabase-schema.sql).
-- =============================================================================

BEGIN;

INSERT INTO expenses (
  id,
  "camionId",
  "tripId",
  "chauffeurId",
  categorie,
  "sousCategorie",
  "fournisseurId",
  montant,
  quantite,
  "prixUnitaire",
  date,
  description
) VALUES
  -- Liées aux 10 trajets « supabase-seed-10-trajets » (004–013)
  ('50000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000003', 92000, 220, 418, '2025-03-01', 'Plein Douala — trajet Douala-Bafoussam'),
  ('50000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'Péage', 'Route nationale', '10000000-0000-4000-8000-000000000003', 18000, NULL, NULL, '2025-03-05', 'Péage Yaoundé-Bertoua'),
  ('50000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000013', 78000, 180, 433, '2025-03-10', 'Station Shell — retour Kribi-Douala'),
  ('50000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000004', 'Maintenance', 'Pneumatiques', '10000000-0000-4000-8000-000000000011', 195000, 4, 48750, '2025-03-12', 'Remplacement pneus avant — Limbe-Bafoussam'),
  ('50000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000005', 'Péage', 'Poste fixe', '10000000-0000-4000-8000-000000000003', 35000, NULL, NULL, '2025-03-18', 'Péage secteur Nord-Ouest'),
  ('50000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000003', 45000, 100, 450, '2025-03-20', 'Plein Ebolowa — livraison bananes'),
  ('50000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000002', 'Maintenance', 'Révision', '10000000-0000-4000-8000-000000000016', 220000, NULL, NULL, '2025-03-22', 'Contrôle freinage avant convoi Maroua'),
  ('50000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000003', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000003', 125000, 300, 417, '2025-03-25', 'Plein Garoua — trajet Garoua-Ngaoundéré'),
  ('50000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000004', 'Autre', 'Frais administratifs', '10000000-0000-4000-8000-000000000008', 15000, NULL, NULL, '2025-04-01', 'Frais dossier annulation client Cimencam'),
  ('50000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000005', 'Péage', 'Pont', '10000000-0000-4000-8000-000000000003', 12000, NULL, NULL, '2025-04-05', 'Péage accès chargement Bertoua'),
  -- Liées aux 3 premiers trajets du seed mouvements (001–003)
  ('50000000-0000-4000-8000-000000000014', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000013', 98000, 240, 408, '2025-02-02', 'Second plein Yaoundé-Garoua'),
  ('50000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Maintenance', 'Vidange', '10000000-0000-4000-8000-000000000005', 85000, NULL, NULL, '2025-02-16', 'Vidange + filtres trajet Ngaoundéré'),
  ('50000000-0000-4000-8000-000000000016', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Assurance', 'Flotte complément', '10000000-0000-4000-8000-000000000018', 45000, NULL, NULL, '2025-01-12', 'Prime complémentaire police cargo'),
  -- Sans trajet (frais généraux atelier / siège)
  ('50000000-0000-4000-8000-000000000017', '30000000-0000-4000-8000-000000000002', NULL, '20000000-0000-4000-8000-000000000002', 'Maintenance', 'Pièces détachées', '10000000-0000-4000-8000-000000000022', 167000, NULL, NULL, '2025-03-08', 'Kit embrayage stock atelier'),
  ('50000000-0000-4000-8000-000000000018', '30000000-0000-4000-8000-000000000004', NULL, '20000000-0000-4000-8000-000000000003', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000003', 110000, 260, 423, '2025-03-14', 'Plein dépôt avant départ express'),
  -- Autres trajets 004–008 avec tiers 010–021
  ('50000000-0000-4000-8000-000000000019', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'Autre', 'Hébergement chauffeur', '10000000-0000-4000-8000-000000000024', 25000, NULL, NULL, '2025-03-01', 'Nuitée relais Bafoussam'),
  ('50000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'Péage', 'Barrière', '10000000-0000-4000-8000-000000000003', 22000, NULL, NULL, '2025-03-06', 'Péage secondaire Est'),
  ('50000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', 'Maintenance', 'Freins', '10000000-0000-4000-8000-000000000016', 135000, NULL, NULL, '2025-03-19', 'Révision freins avant Bamenda'),
  ('50000000-0000-4000-8000-000000000022', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000008', 62000, 150, 413, '2025-03-10', 'Cimencam dépôt — carburant partenaire'),
  ('50000000-0000-4000-8000-000000000023', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000004', 'Autre', 'Lavage', '10000000-0000-4000-8000-000000000015', 8000, NULL, NULL, '2025-03-13', 'Nettoyage plateau Limbe')
ON CONFLICT (id) DO NOTHING;

-- Sorties caisse liées (même logique que l’app : prélèvement caisse pour chaque dépense)
INSERT INTO caisse_transactions (
  id,
  type,
  montant,
  date,
  description,
  categorie,
  reference,
  "exclutRevenu"
) VALUES
  ('caisse-dep-50000000-0000-4000-8000-000000000004', 'sortie', 92000, '2025-03-01', 'Dépense — Plein Douala — trajet Douala-Bafoussam', 'Carburant', 'depense:50000000-0000-4000-8000-000000000004', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000005', 'sortie', 18000, '2025-03-05', 'Dépense — Péage Yaoundé-Bertoua', 'Péage', 'depense:50000000-0000-4000-8000-000000000005', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000006', 'sortie', 78000, '2025-03-10', 'Dépense — Station Shell — retour Kribi-Douala', 'Carburant', 'depense:50000000-0000-4000-8000-000000000006', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000007', 'sortie', 195000, '2025-03-12', 'Dépense — Remplacement pneus avant — Limbe-Bafoussam', 'Maintenance', 'depense:50000000-0000-4000-8000-000000000007', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000008', 'sortie', 35000, '2025-03-18', 'Dépense — Péage secteur Nord-Ouest', 'Péage', 'depense:50000000-0000-4000-8000-000000000008', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000009', 'sortie', 45000, '2025-03-20', 'Dépense — Plein Ebolowa — livraison bananes', 'Carburant', 'depense:50000000-0000-4000-8000-000000000009', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000010', 'sortie', 220000, '2025-03-22', 'Dépense — Contrôle freinage avant convoi Maroua', 'Maintenance', 'depense:50000000-0000-4000-8000-000000000010', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000011', 'sortie', 125000, '2025-03-25', 'Dépense — Plein Garoua — trajet Garoua-Ngaoundéré', 'Carburant', 'depense:50000000-0000-4000-8000-000000000011', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000012', 'sortie', 15000, '2025-04-01', 'Dépense — Frais dossier annulation client Cimencam', 'Autre', 'depense:50000000-0000-4000-8000-000000000012', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000013', 'sortie', 12000, '2025-04-05', 'Dépense — Péage accès chargement Bertoua', 'Péage', 'depense:50000000-0000-4000-8000-000000000013', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000014', 'sortie', 98000, '2025-02-02', 'Dépense — Second plein Yaoundé-Garoua', 'Carburant', 'depense:50000000-0000-4000-8000-000000000014', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000015', 'sortie', 85000, '2025-02-16', 'Dépense — Vidange + filtres trajet Ngaoundéré', 'Maintenance', 'depense:50000000-0000-4000-8000-000000000015', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000016', 'sortie', 45000, '2025-01-12', 'Dépense — Prime complémentaire police cargo', 'Assurance', 'depense:50000000-0000-4000-8000-000000000016', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000017', 'sortie', 167000, '2025-03-08', 'Dépense — Kit embrayage stock atelier', 'Maintenance', 'depense:50000000-0000-4000-8000-000000000017', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000018', 'sortie', 110000, '2025-03-14', 'Dépense — Plein dépôt avant départ express', 'Carburant', 'depense:50000000-0000-4000-8000-000000000018', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000019', 'sortie', 25000, '2025-03-01', 'Dépense — Nuitée relais Bafoussam', 'Autre', 'depense:50000000-0000-4000-8000-000000000019', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000020', 'sortie', 22000, '2025-03-06', 'Dépense — Péage secondaire Est', 'Péage', 'depense:50000000-0000-4000-8000-000000000020', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000021', 'sortie', 135000, '2025-03-19', 'Dépense — Révision freins avant Bamenda', 'Maintenance', 'depense:50000000-0000-4000-8000-000000000021', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000022', 'sortie', 62000, '2025-03-10', 'Dépense — Cimencam dépôt — carburant partenaire', 'Carburant', 'depense:50000000-0000-4000-8000-000000000022', false),
  ('caisse-dep-50000000-0000-4000-8000-000000000023', 'sortie', 8000, '2025-03-13', 'Dépense — Nettoyage plateau Limbe', 'Autre', 'depense:50000000-0000-4000-8000-000000000023', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
