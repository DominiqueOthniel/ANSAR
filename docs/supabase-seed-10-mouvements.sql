-- =============================================================================
-- SIA-ANSAR — Jeu de données : 10 cas de figure (mouvements métier)
-- Coller dans Supabase → SQL Editor → Run
--
-- PRÉREQUIS : tables créées (voir backend/supabase-schema.sql)
-- ATTENTION : utilise des UUID fixes. Si collision (déjà insérés), supprime
-- les lignes ou change les UUID avant ré-exécution.
--
-- Hors scope Postgres : caisse (localStorage) et crédits (localStorage).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Référentiels minimaux (FK)
-- -----------------------------------------------------------------------------
INSERT INTO third_parties (id, nom, telephone, email, adresse, type, notes) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Jean Mbarga', '+237 690 12 34 56', 'jm@ex.cm', 'Douala', 'proprietaire', 'Seed QA'),
  ('10000000-0000-4000-8000-000000000002', 'Marie Ngo', '+237 691 23 45 67', 'mn@ex.cm', 'Yaoundé', 'client', NULL),
  ('10000000-0000-4000-8000-000000000003', 'Total Cameroun', '+237 233 40 00 00', NULL, 'Douala', 'fournisseur', NULL),
  ('10000000-0000-4000-8000-000000000004', 'Socopa SA', '+237 222 21 00 00', NULL, 'Douala', 'client', NULL),
  ('10000000-0000-4000-8000-000000000005', 'Garage Central', '+237 233 41 11 11', NULL, 'Douala', 'fournisseur', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO drivers (id, nom, prenom, telephone, cni, photo) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Moukoko', 'Samuel', '+237 670 11 22 33', 'CM1234567890001', NULL),
  ('20000000-0000-4000-8000-000000000002', 'Abega', 'Roger', '+237 671 22 33 44', 'CM1234567890002', NULL),
  ('20000000-0000-4000-8000-000000000003', 'Nkoulou', 'Aurélien', '+237 672 33 44 55', 'CM1234567890003', NULL),
  ('20000000-0000-4000-8000-000000000004', 'Onguene', 'Eric', '+237 673 44 55 66', 'CM1234567890004', NULL),
  ('20000000-0000-4000-8000-000000000005', 'Toko', 'Patrick', '+237 674 55 66 77', 'CM1234567890005', NULL)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Camions + trajets (base pour dépenses / factures)
-- -----------------------------------------------------------------------------
INSERT INTO trucks (id, immatriculation, modele, type, statut, "dateMiseEnCirculation", photo, "proprietaireId", "chauffeurId") VALUES
  ('30000000-0000-4000-8000-000000000001', 'LT-1001-AB', 'Volvo FH16', 'tracteur', 'actif', '2020-03-15', NULL, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', 'LT-1002-CD', 'Scania R500', 'tracteur', 'actif', '2019-07-22', NULL, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003', 'LR-2001-RR', 'Remorque 40p', 'remorqueuse', 'actif', '2019-02-28', NULL, NULL, NULL),
  ('30000000-0000-4000-8000-000000000004', 'LT-1003-EF', 'MAN TGX', 'tracteur', 'actif', '2021-01-10', NULL, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO trips (id, "tracteurId", "remorqueuseId", origine, destination, "origineLat", "origineLng", "destinationLat", "destinationLng", "chauffeurId", "dateDepart", "dateArrivee", recette, prefinancement, client, marchandise, description, statut) VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'Douala', 'Yaoundé', NULL, NULL, NULL, NULL, '20000000-0000-4000-8000-000000000001', '2025-01-10', '2025-01-10', 450000, 100000, 'Marie Ngo', 'Électronique', 'Cas trajet', 'termine'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', NULL, 'Yaoundé', 'Garoua', NULL, NULL, NULL, NULL, '20000000-0000-4000-8000-000000000002', '2025-02-01', '2025-02-03', 1200000, NULL, 'Socopa SA', 'Ciment', NULL, 'termine'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', 'Douala', 'Ngaoundéré', NULL, NULL, NULL, NULL, '20000000-0000-4000-8000-000000000003', '2025-02-15', NULL, 950000, 200000, 'Bolloré', 'Divers', NULL, 'en_cours')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- CAS 3–4 : Dépenses (sorties d’argent)
-- -----------------------------------------------------------------------------
INSERT INTO expenses (id, "camionId", "tripId", "chauffeurId", categorie, "sousCategorie", "fournisseurId", montant, quantite, "prixUnitaire", date, description) VALUES
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Carburant', 'Diesel', '10000000-0000-4000-8000-000000000003', 85000, 200, 425, '2025-01-10', 'CAS3 — Plein Douala'),
  ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Péage', 'Autoroute', '10000000-0000-4000-8000-000000000003', 25000, NULL, NULL, '2025-02-01', 'CAS4 — Péage Yaoundé-Garoua'),
  ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Maintenance', 'Révision', '10000000-0000-4000-8000-000000000005', 150000, NULL, NULL, '2025-02-14', 'CAS4 — Révision garage')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- CAS 5–6 : Factures (encaissements / créances)
-- -----------------------------------------------------------------------------
INSERT INTO invoices (id, numero, "trajetId", "expenseId", statut, "montantHT", remise, "montantHTApresRemise", tva, tps, "montantTTC", "montantPaye", "dateCreation", "datePaiement", "modePaiement", notes) VALUES
  ('60000000-0000-4000-8000-000000000001', 'FAC-SEED-001', '40000000-0000-4000-8000-000000000001', NULL, 'payee', 409091, NULL, NULL, 40909, NULL, 450000, 450000, '2025-01-11', '2025-01-12', 'Virement bancaire', 'CAS5 — Facture soldée'),
  ('60000000-0000-4000-8000-000000000002', 'FAC-SEED-002', '40000000-0000-4000-8000-000000000002', NULL, 'en_attente', 1090909, NULL, NULL, 109091, NULL, 1200000, 600000, '2025-02-04', '2025-02-05', 'Chèque', 'CAS6 — Paiement partiel (reste 600k)'),
  ('60000000-0000-4000-8000-000000000003', 'FAC-SEED-003', '40000000-0000-4000-8000-000000000003', NULL, 'en_attente', 863636, NULL, NULL, 86364, NULL, 950000, 0, '2025-02-16', NULL, NULL, 'CAS6 — Facture en attente totale')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Comptes banque (base pour mouvements 7–10)
-- -----------------------------------------------------------------------------
INSERT INTO bank_accounts (id, nom, "numeroCompte", banque, type, "soldeInitial", "soldeActuel", devise, iban, swift, notes) VALUES
  ('70000000-0000-4000-8000-000000000001', 'Compte Principal QA', 'CM-QA-0001', 'BICEC', 'courant', 5000000, 5000000, 'FCFA', NULL, NULL, 'Seed'),
  ('70000000-0000-4000-8000-000000000002', 'Compte Épargne QA', 'CM-QA-0002', 'Afriland', 'epargne', 1000000, 1000000, 'FCFA', NULL, NULL, 'Seed')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- CAS 1–2 : Mouvements chauffeur (apport / sortie)
-- -----------------------------------------------------------------------------
INSERT INTO driver_transactions (id, type, montant, date, description, "driverId") VALUES
  ('80000000-0000-4000-8000-000000000001', 'apport', 150000, '2025-01-05', 'CAS1 — Apport espèces chauffeur', '20000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000002', 'sortie', 35000, '2025-01-06', 'CAS2 — Achat pièces détachées', '20000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000003', 'apport', 80000, '2025-02-01', 'CAS1 — Prime trajet', '20000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000004', 'sortie', 12000, '2025-02-02', 'CAS2 — Frais parking', '20000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000005', 'apport', 45000, '2025-02-03', 'CAS1 — Avance remboursée', '20000000-0000-4000-8000-000000000003'),
  ('80000000-0000-4000-8000-000000000006', 'sortie', 22000, '2025-02-04', 'CAS2 — Téléphone / communication', '20000000-0000-4000-8000-000000000003'),
  ('80000000-0000-4000-8000-000000000007', 'apport', 200000, '2025-02-05', 'CAS1 — Caution rendue', '20000000-0000-4000-8000-000000000004'),
  ('80000000-0000-4000-8000-000000000008', 'sortie', 67000, '2025-02-06', 'CAS2 — Entretien véhicule perso', '20000000-0000-4000-8000-000000000004'),
  ('80000000-0000-4000-8000-000000000009', 'apport', 30000, '2025-02-07', 'CAS1 — Bonus ponctualité', '20000000-0000-4000-8000-000000000005'),
  ('80000000-0000-4000-8000-000000000010', 'sortie', 9500, '2025-02-08', 'CAS2 — Divers', '20000000-0000-4000-8000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- CAS 7–10 : Tous les types de mouvements bancaires
-- depot, retrait, virement (crédit), prelevement, frais
-- -----------------------------------------------------------------------------
INSERT INTO bank_transactions (id, "compteId", type, montant, date, description, reference, beneficiaire, categorie) VALUES
  ('81000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'depot', 500000, '2025-01-08', 'CAS7 — Dépôt espèces agence', 'DEP-QA-01', NULL, 'Dépôt'),
  ('81000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'retrait', 120000, '2025-01-09', 'CAS8 — Retrait espèces / carburant', 'RET-QA-01', 'Total Cameroun', 'Exploitation'),
  ('81000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000001', 'virement', 450000, '2025-01-12', 'CAS9 — Virement entrant client', 'VIR-IN-01', 'Marie Ngo', 'Factures clients'),
  ('81000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000001', 'prelevement', 85000, '2025-02-01', 'CAS10 — Prélèvement SEPA / fournisseur', 'PREL-QA-01', 'Fournisseur divers', 'Fournisseurs'),
  ('81000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000001', 'frais', 7500, '2025-02-01', 'CAS10 — Frais bancaires mensuels', 'FRAIS-QA-01', 'BICEC', 'Banque'),
  ('81000000-0000-4000-8000-000000000006', '70000000-0000-4000-8000-000000000001', 'retrait', 200000, '2025-02-05', 'Transfert interne — sortie principal vers épargne', 'VIR-INT-01', 'Compte Épargne QA', 'Trésorerie'),
  ('81000000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000002', 'depot', 200000, '2025-02-05', 'Transfert interne — entrée sur épargne', 'VIR-INT-01', 'Compte Principal QA', 'Trésorerie'),
  ('81000000-0000-4000-8000-000000000008', '70000000-0000-4000-8000-000000000001', 'retrait', 50000, '2025-02-06', 'Retrait guichet', 'RET-QA-02', NULL, 'Divers'),
  ('81000000-0000-4000-8000-000000000009', '70000000-0000-4000-8000-000000000001', 'depot', 100000, '2025-02-07', 'Versement chèque', 'CHQ-QA-01', NULL, 'Dépôt'),
  ('81000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000002', 'depot', 50000, '2025-02-08', 'Intérêts épargne', 'INT-QA-01', NULL, 'Financier')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Recalcul soldes banque (même règle que l’app : depot+virement +montant ; sinon -montant)
-- -----------------------------------------------------------------------------
UPDATE bank_accounts ba
SET "soldeActuel" = sub.solde
FROM (
  SELECT
    ba2.id,
    ba2."soldeInitial" + COALESCE(SUM(
      CASE
        WHEN bt.type IN ('depot', 'virement') THEN bt.montant
        ELSE -bt.montant
      END
    ), 0) AS solde
  FROM bank_accounts ba2
  LEFT JOIN bank_transactions bt ON bt."compteId" = ba2.id
  WHERE ba2.id IN (
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002'
  )
  GROUP BY ba2.id, ba2."soldeInitial"
) sub
WHERE ba.id = sub.id;

COMMIT;

-- Vérification rapide (optionnel) :
-- SELECT id, nom, "soldeActuel" FROM bank_accounts WHERE id::text LIKE '70000000%';
-- SELECT type, montant, description FROM bank_transactions WHERE "compteId" = '70000000-0000-4000-8000-000000000001';
