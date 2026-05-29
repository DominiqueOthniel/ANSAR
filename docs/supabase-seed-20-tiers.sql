-- =============================================================================
-- 20 tiers (third_parties) — SIA-ANSAR / Supabase
-- Exécuter dans SQL Editor après création de la table (backend/supabase-schema.sql)
--
-- type : 'proprietaire' | 'client' | 'fournisseur'
-- UUID : 10000000-0000-4000-8000-000000000006 … 000000000025
-- Si les IDs 001–005 existent déjà (seed mouvements), ce script ajoute 006–025.
-- =============================================================================

BEGIN;

INSERT INTO third_parties (id, nom, telephone, email, adresse, type, notes) VALUES
  ('10000000-0000-4000-8000-000000000006', 'Nkodo & Fils Transport', '+237 233 10 01 01', 'contact@nkodo.cm', 'Zone industrielle Bassa, Douala', 'client', NULL),
  ('10000000-0000-4000-8000-000000000007', 'Brasseries du Cameroun', '+237 233 42 00 00', 'bdc@brasseries.cm', 'Boulevard de la Liberté, Douala', 'client', 'Livraisons nationales'),
  ('10000000-0000-4000-8000-000000000008', 'Cimencam — Dépôt Yaoundé', '+237 222 22 33 44', NULL, 'Nsimeyong, Yaoundé', 'fournisseur', 'Ciment & liants'),
  ('10000000-0000-4000-8000-000000000009', 'Paul Essomba', '+237 677 88 99 00', 'p.essomba@mail.cm', 'Logpom, Douala', 'proprietaire', '2 tracteurs'),
  ('10000000-0000-4000-8000-000000000010', 'Agro-Export Cameroun SARL', '+237 233 55 66 77', 'export@agroexport.cm', 'Bonabéri, Douala', 'client', 'Cacao & café'),
  ('10000000-0000-4000-8000-000000000011', 'Pneus Express Afrique', '+237 233 77 88 99', 'commandes@pneusexpress.cm', 'Akwa, Douala', 'fournisseur', 'Pneus poids lourds'),
  ('10000000-0000-4000-8000-000000000012', 'Minoterie du Nord', '+237 222 31 20 00', NULL, 'Garoua', 'client', 'Farine & blé'),
  ('10000000-0000-4000-8000-000000000013', 'Station Shell Bonamoussadi', '+237 690 12 00 34', NULL, 'Bonamoussadi, Douala', 'fournisseur', 'Carburant'),
  ('10000000-0000-4000-8000-000000000014', 'Martine Owona', '+237 699 45 67 89', 'm.owona@yahoo.fr', 'Yaoundé', 'proprietaire', 'Remorque plateau'),
  ('10000000-0000-4000-8000-000000000015', 'Logistique Express 237', '+237 650 11 22 33', 'contact@le237.cm', 'Douala', 'client', 'Frêt express'),
  ('10000000-0000-4000-8000-000000000016', 'Garage Mécanique Sud', '+237 233 90 11 22', 'garage.sud@mail.cm', 'Bafoussam', 'fournisseur', 'Réparation & pièces'),
  ('10000000-0000-4000-8000-000000000017', 'Société Bois & Bois', '+237 222 45 67 89', 'info@boisbois.cm', 'Bertoua', 'client', 'Grumes'),
  ('10000000-0000-4000-8000-000000000018', 'Assurances Africaines SA', '+237 233 20 30 40', 'flotte@africaines.cm', 'Douala', 'fournisseur', 'Police flotte'),
  ('10000000-0000-4000-8000-000000000019', 'Chantal Mballa', '+237 678 00 11 22', NULL, 'Yaoundé', 'proprietaire', NULL),
  ('10000000-0000-4000-8000-000000000020', 'Port de Kribi — Logistique', '+237 233 80 90 00', 'log@portkribi.cm', 'Kribi', 'client', 'Conteneurs'),
  ('10000000-0000-4000-8000-000000000021', 'Huilerie du Littoral', '+237 233 44 55 66', NULL, 'Douala', 'client', 'Huile brute'),
  ('10000000-0000-4000-8000-000000000022', 'Pièces Auto Lourd CM', '+237 233 12 34 56', 'pieces@pal.cm', 'Douala', 'fournisseur', 'Filtres, freins'),
  ('10000000-0000-4000-8000-000000000023', 'Coopérative Café Ouest', '+237 677 33 44 55', 'coop@cafeouest.cm', 'Bafoussam', 'client', NULL),
  ('10000000-0000-4000-8000-000000000024', 'Hôtel Sawa — Services généraux', '+237 233 42 10 20', 'achats@hotelsawa.cm', 'Douala', 'fournisseur', 'Prestations diverses'),
  ('10000000-0000-4000-8000-000000000025', 'Import-Export Sahel', '+237 222 10 20 30', 'contact@iesahel.cm', 'Maroua', 'client', 'Transfrontalier')
ON CONFLICT (id) DO NOTHING;

COMMIT;
