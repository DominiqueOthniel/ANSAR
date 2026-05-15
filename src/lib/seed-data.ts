/**
 * Données de démonstration : cas variés sur l’app (trajets annulés / en cours,
 * clients avec plafonds, expéditions colis, factures payées ou en attente,
 * créances « commande sans paiement » avec fiche client, banque, caisse).
 */

import {
  trucksApi,
  driversApi,
  tripsApi,
  parcelExpeditionsApi,
  expensesApi,
  invoicesApi,
  thirdPartiesApi,
  adminApi,
} from './api';
import type { ThirdPartyPayload } from './api';

// --- TIERS (15) : plafonds sur les fiches client pour tester l’encours ---
const TIERS_SEED: ThirdPartyPayload[] = [
  { nom: 'Jean Mbarga', telephone: '+237 690 12 34 56', type: 'proprietaire', adresse: 'Douala, Akwa' },
  {
    nom: 'Marie Ngo',
    telephone: '+237 691 23 45 67',
    type: 'client',
    adresse: 'Yaoundé, Bastos',
    plafondCredit: 2_000_000,
    notes: 'Client fidèle — plafond modéré',
  },
  { nom: 'Total Cameroun', telephone: '+237 233 40 00 00', type: 'fournisseur', adresse: 'Douala, Bonabéri' },
  { nom: 'Pierre Essono', telephone: '+237 692 34 56 78', type: 'proprietaire' },
  {
    nom: 'Socopa SA',
    telephone: '+237 222 21 00 00',
    type: 'client',
    adresse: 'Douala',
    plafondCredit: 15_000_000,
    notes: 'Gros compte — plafond élevé',
  },
  { nom: 'Garage Central', telephone: '+237 233 41 11 11', type: 'fournisseur' },
  { nom: 'Anne Fotso', telephone: '+237 693 45 67 89', type: 'proprietaire' },
  {
    nom: 'Bolloré Transport',
    telephone: '+237 233 50 20 20',
    type: 'client',
    plafondCredit: 8_000_000,
  },
  { nom: 'Assurances AXA', telephone: '+237 233 42 00 00', type: 'fournisseur' },
  {
    nom: 'Paul Tchakounte',
    telephone: '+237 694 56 78 90',
    type: 'client',
    plafondCredit: 1_200_000,
    notes: 'Plafond serré — utile pour tester le dépassement',
  },
  { nom: 'Ndongo Logistique SARL', telephone: '+237 655 10 20 30', type: 'proprietaire', adresse: 'Douala Bassa' },
  {
    nom: 'Douala Express SARL',
    telephone: '+237 677 88 99 00',
    type: 'client',
    adresse: 'Douala Akwa',
    plafondCredit: 500_000,
    notes: 'Petit plafond — commandes courtes',
  },
  {
    nom: 'Pharmacentre',
    telephone: '+237 678 11 22 33',
    type: 'client',
    adresse: 'Yaoundé',
    notes: 'Sans plafond renseigné (null) — règles au cas par cas',
  },
  {
    nom: 'Sawa Logistics',
    telephone: '+237 679 44 55 66',
    type: 'client',
    plafondCredit: 3_500_000,
  },
  { nom: 'Pièces Mfoundi', telephone: '+237 222 99 88 77', type: 'fournisseur', adresse: 'Yaoundé Mfoundi' },
  {
    nom: 'Secrétariat général — Mme Atangana',
    telephone: '+237 600 11 22 33',
    type: 'employe',
    notes: 'Personnel siège (ex. salaires hors chauffeurs)',
  },
  { nom: 'Comptable junior', type: 'employe', notes: 'Démonstration type employé' },
];

// --- CHAUFFEURS (15) ---
const DRIVERS_SEED = [
  { nom: 'Moukoko', prenom: 'Samuel', telephone: '+237 670 11 22 33', cni: '1234567890123' },
  { nom: 'Abega', prenom: 'Roger', telephone: '+237 671 22 33 44', cni: '1234567890124' },
  { nom: 'Nkoulou', prenom: 'Aurélien', telephone: '+237 672 33 44 55', cni: '1234567890125' },
  { nom: 'Onguene', prenom: 'Eric', telephone: '+237 673 44 55 66', cni: '1234567890126' },
  { nom: 'Toko', prenom: 'Patrick', telephone: '+237 674 55 66 77', cni: '1234567890127' },
  { nom: 'Kunde', prenom: 'Joseph', telephone: '+237 675 66 77 88', cni: '1234567890128' },
  { nom: 'Milla', prenom: 'Roger', telephone: '+237 676 77 88 99', cni: '1234567890129' },
  { nom: 'Song', prenom: 'Alexandre', telephone: '+237 677 88 99 00', cni: '1234567890130' },
  { nom: "Eto'o", prenom: 'Samuel', telephone: '+237 678 99 00 11', cni: '1234567890131' },
  { nom: 'Mbia', prenom: 'Stéphane', telephone: '+237 679 00 11 22', cni: '1234567890132' },
  { nom: 'Chedjou', prenom: 'Nicolas', telephone: '+237 680 10 20 30', cni: '1234567890133' },
  { nom: 'Mandjeck', prenom: 'Georges', telephone: '+237 681 20 30 40', cni: '1234567890134' },
  { nom: 'Bassong', prenom: 'Sébastien', telephone: '+237 682 30 40 50', cni: '1234567890135' },
  { nom: 'Nkodo', prenom: 'Fabrice', telephone: '+237 683 40 50 60', cni: '1234567890136' },
  { nom: 'Zoua', prenom: 'Brice', telephone: '+237 684 50 60 70', cni: '1234567890137' },
];

const getTrucksSeed = (proprietaireIds: string[]) => {
  const p = (i: number) => proprietaireIds[Math.min(i, Math.max(proprietaireIds.length - 1, 0))] || undefined;
  return [
    { immatriculation: 'LT-1234-AB', modele: 'Volvo FH16', type: 'tracteur' as const, statut: 'actif' as const, dateMiseEnCirculation: '2020-03-15', proprietaireId: p(0) },
    { immatriculation: 'LT-5678-CD', modele: 'Scania R500', type: 'tracteur' as const, statut: 'actif' as const, dateMiseEnCirculation: '2019-07-22', proprietaireId: p(0) },
    { immatriculation: 'LT-9012-EF', modele: 'MAN TGX', type: 'tracteur' as const, statut: 'actif' as const, dateMiseEnCirculation: '2021-01-10', proprietaireId: p(1) },
    { immatriculation: 'LT-3456-GH', modele: 'DAF XF', type: 'tracteur' as const, statut: 'inactif' as const, dateMiseEnCirculation: '2018-11-05', proprietaireId: p(1) },
    { immatriculation: 'LT-7890-IJ', modele: 'Iveco Stralis', type: 'tracteur' as const, statut: 'actif' as const, dateMiseEnCirculation: '2022-05-18', proprietaireId: p(2) },
    { immatriculation: 'LR-1111-KL', modele: 'Remorque 40 pieds', type: 'remorqueuse' as const, statut: 'actif' as const, dateMiseEnCirculation: '2019-02-28' },
    { immatriculation: 'LR-2222-MN', modele: 'Remorque frigorifique', type: 'remorqueuse' as const, statut: 'actif' as const, dateMiseEnCirculation: '2020-09-12' },
    { immatriculation: 'LT-3333-OP', modele: 'Mercedes Actros', type: 'tracteur' as const, statut: 'actif' as const, dateMiseEnCirculation: '2021-08-30', proprietaireId: p(2) },
    { immatriculation: 'LT-4444-QR', modele: 'Renault T High', type: 'tracteur' as const, statut: 'actif' as const, dateMiseEnCirculation: '2023-02-14', proprietaireId: p(0) },
    { immatriculation: 'LR-5555-ST', modele: 'Citerne 30m³', type: 'remorqueuse' as const, statut: 'actif' as const, dateMiseEnCirculation: '2020-06-20' },
    { immatriculation: 'LT-6666-WX', modele: 'Volvo FM', type: 'tracteur' as const, statut: 'actif' as const, dateMiseEnCirculation: '2022-11-01', proprietaireId: p(3) },
    { immatriculation: 'LT-7777-YZ', modele: 'Mercedes Arocs', type: 'tracteur' as const, statut: 'inactif' as const, dateMiseEnCirculation: '2017-04-12', proprietaireId: p(3) },
  ];
};

const getTripsSeed = (chauffeurIds: string[], tracteurIds: string[], remorqueIds: string[]) => {
  const ch = (i: number) => chauffeurIds[Math.min(i, Math.max(chauffeurIds.length - 1, 0))] || '';
  const tr = (i: number) => tracteurIds[Math.min(i, Math.max(tracteurIds.length - 1, 0))] || '';
  const rem = (i: number) => (remorqueIds.length ? remorqueIds[Math.min(i, remorqueIds.length - 1)] : undefined);
  return [
    { origine: 'Douala', destination: 'Yaoundé', chauffeurId: ch(0), tracteurId: tr(0), remorqueuseId: rem(0), dateDepart: '2024-11-05', dateArrivee: '2024-11-05', recette: 450000, prefinancement: 100000, client: 'Marie Ngo', marchandise: 'Électronique', statut: 'termine' as const },
    { origine: 'Yaoundé', destination: 'Garoua', chauffeurId: ch(1), tracteurId: tr(1), dateDepart: '2024-12-10', dateArrivee: '2024-12-12', recette: 1200000, client: 'Socopa SA', marchandise: 'Ciment', statut: 'termine' as const },
    { origine: 'Douala', destination: 'Ngaoundéré', chauffeurId: ch(2), tracteurId: tr(2), remorqueuseId: rem(1), dateDepart: '2025-01-15', dateArrivee: '2025-01-17', recette: 950000, prefinancement: 200000, client: 'Bolloré Transport', statut: 'en_cours' as const },
    { origine: 'Bafoussam', destination: 'Douala', chauffeurId: ch(3), tracteurId: tr(3), dateDepart: '2025-02-01', dateArrivee: '2025-02-02', recette: 380000, marchandise: 'Café', statut: 'planifie' as const },
    { origine: 'Maroua', destination: 'Douala', chauffeurId: ch(4), tracteurId: tr(4), dateDepart: '2024-10-20', dateArrivee: '2024-10-23', recette: 1800000, client: 'Paul Tchakounte', statut: 'termine' as const },
    { origine: 'Ebolowa', destination: 'Yaoundé', chauffeurId: ch(5), tracteurId: tr(0), dateDepart: '2025-01-28', dateArrivee: '2025-01-29', recette: 280000, statut: 'planifie' as const },
    { origine: 'Douala', destination: 'Bamenda', chauffeurId: ch(6), tracteurId: tr(1), remorqueuseId: rem(0), dateDepart: '2024-09-12', dateArrivee: '2024-09-13', recette: 520000, prefinancement: 150000, client: 'Marie Ngo', statut: 'termine' as const },
    { origine: 'Kribi', destination: 'Douala', chauffeurId: ch(7), tracteurId: tr(2), dateDepart: '2025-02-10', dateArrivee: '2025-02-11', recette: 320000, marchandise: 'Bois', statut: 'planifie' as const },
    { origine: 'Bertoua', destination: 'Yaoundé', chauffeurId: ch(8), tracteurId: tr(3), dateDepart: '2024-11-25', dateArrivee: '2024-11-26', recette: 410000, statut: 'termine' as const },
    { origine: 'Limbe', destination: 'Bafoussam', chauffeurId: ch(9), tracteurId: tr(4), remorqueuseId: rem(1), dateDepart: '2025-02-15', dateArrivee: '2025-02-16', recette: 480000, client: 'Socopa SA', statut: 'planifie' as const },
    { origine: 'Douala', destination: 'Bafang', chauffeurId: ch(10), tracteurId: tr(0), remorqueuseId: rem(0), dateDepart: '2025-01-10', dateArrivee: '2025-01-10', recette: 175000, prefinancement: 20000, client: 'Pharmacentre', marchandise: 'Médicaments', statut: 'annule' as const },
    { origine: 'Kumba', destination: 'Douala', chauffeurId: ch(11), tracteurId: tr(1), dateDepart: '2025-02-03', dateArrivee: '2025-02-03', recette: 420000, client: 'Douala Express SARL', marchandise: 'Palettes diverses', statut: 'termine' as const },
    { origine: 'Edéa', destination: 'Yaoundé', chauffeurId: ch(12), tracteurId: tr(2), remorqueuseId: rem(1), dateDepart: '2025-02-18', dateArrivee: '2025-02-19', recette: 310000, client: 'Sawa Logistics', statut: 'en_cours' as const },
    { origine: 'Nkongsamba', destination: 'Douala', chauffeurId: ch(13), tracteurId: tr(3), dateDepart: '2025-03-01', dateArrivee: '2025-03-02', recette: 265000, client: 'Pharmacentre', statut: 'planifie' as const },
    { origine: 'Douala', destination: 'Kribi', chauffeurId: ch(14), tracteurId: tr(4), remorqueuseId: rem(0), dateDepart: '2025-01-22', dateArrivee: '2025-01-22', recette: 195000, client: 'Marie Ngo', marchandise: 'Fret léger', statut: 'termine' as const },
  ];
};

const getExpensesSeed = (camionIds: string[], tripIds: string[], chauffeurIds: string[], fournisseurIds: string[]) => {
  const c = (i: number) => camionIds[Math.min(i, Math.max(camionIds.length - 1, 0))] || '';
  const trip = (i: number) => tripIds[Math.min(i, Math.max(tripIds.length - 1, 0))] || '';
  const ch = (i: number) => chauffeurIds[Math.min(i, Math.max(chauffeurIds.length - 1, 0))] || '';
  const four = (i: number) => fournisseurIds[Math.min(i, Math.max(fournisseurIds.length - 1, 0))] || '';
  return [
    { camionId: c(0), tripId: trip(0), chauffeurId: ch(0), categorie: 'Carburant', sousCategorie: 'Diesel', montant: 85000, quantite: 200, prixUnitaire: 425, date: '2024-11-05', description: 'Plein Douala', fournisseurId: four(0) },
    { camionId: c(1), tripId: trip(1), chauffeurId: ch(1), categorie: 'Péage', sousCategorie: 'Autoroute', montant: 25000, date: '2024-12-10', description: 'Péage Yaoundé-Garoua', fournisseurId: four(1) },
    { camionId: c(2), tripId: trip(2), chauffeurId: ch(2), categorie: 'Maintenance', sousCategorie: 'Révision', montant: 150000, date: '2025-01-14', description: 'Révision 100 000 km', fournisseurId: four(1) },
    { camionId: c(0), categorie: 'Assurance', sousCategorie: 'Assurance véhicule', montant: 320000, date: '2025-01-01', description: 'Assurance annuelle LT-1234', fournisseurId: four(2) },
    { camionId: c(3), tripId: trip(3), chauffeurId: ch(3), categorie: 'Carburant', sousCategorie: 'Diesel', montant: 62000, quantite: 150, date: '2025-02-01', description: 'Plein Bafoussam', fournisseurId: four(0) },
    { camionId: c(1), tripId: trip(4), chauffeurId: ch(4), categorie: 'Péage', montant: 45000, date: '2024-10-21', description: 'Péages Maroua-Douala', fournisseurId: four(1) },
    { camionId: c(2), categorie: 'Maintenance', sousCategorie: 'Pièces détachées', montant: 95000, date: '2024-12-20', description: 'Freins avant', fournisseurId: four(1) },
    { camionId: c(4), tripId: trip(5), chauffeurId: ch(5), categorie: 'Carburant', sousCategorie: 'Diesel', montant: 48000, date: '2025-01-28', description: 'Plein Ebolowa', fournisseurId: four(0) },
    { camionId: c(0), tripId: trip(6), chauffeurId: ch(6), categorie: 'Péage', montant: 18000, date: '2024-09-12', description: 'Péage Douala-Bamenda', fournisseurId: four(1) },
    { camionId: c(3), categorie: 'Maintenance', sousCategorie: 'Vidange', montant: 45000, date: '2025-02-05', description: 'Vidange moteur', fournisseurId: four(1) },
    { camionId: c(0), tripId: trip(10), chauffeurId: ch(10), categorie: 'Carburant', sousCategorie: 'Diesel', montant: 35000, date: '2025-01-09', description: 'Plein avant annulation Bafang', fournisseurId: four(0) },
    { camionId: c(1), tripId: trip(11), chauffeurId: ch(11), categorie: 'Péage', montant: 12000, date: '2025-02-03', description: 'Péages Kumba-Douala', fournisseurId: four(1) },
    { camionId: c(2), tripId: trip(12), chauffeurId: ch(12), categorie: 'Carburant', sousCategorie: 'Diesel', montant: 71000, quantite: 170, date: '2025-02-18', description: 'Plein Edéa', fournisseurId: four(0) },
    { camionId: c(3), tripId: trip(13), chauffeurId: ch(13), categorie: 'Frais administratifs', montant: 8000, date: '2025-02-28', description: 'Visa parking Nkongsamba', fournisseurId: four(1) },
    { camionId: c(4), tripId: trip(14), chauffeurId: ch(14), categorie: 'Carburant', sousCategorie: 'Diesel', montant: 42000, date: '2025-01-22', description: 'Plein Douala-Kribi', fournisseurId: four(0) },
  ];
};

/** TTC = recette ; HT = TTC/1.1, TVA = TTC - HT (arrondi entier). */
function invoiceFromRecette(
  numero: string,
  trajetId: string,
  recette: number,
  statut: 'payee' | 'en_attente',
  dateCreation: string,
  opts?: { montantPaye?: number; datePaiement?: string; modePaiement?: string },
) {
  const montantTTC = recette;
  const montantHT = Math.round(montantTTC / 1.1);
  const tva = montantTTC - montantHT;
  return {
    numero,
    trajetId,
    statut,
    montantHT,
    tva,
    montantTTC,
    montantPaye: opts?.montantPaye,
    dateCreation,
    datePaiement: opts?.datePaiement,
    modePaiement: opts?.modePaiement,
  };
}

const getInvoicesSeed = (tripIds: string[]) => {
  const t = (i: number) => tripIds[Math.min(i, Math.max(tripIds.length - 1, 0))] || '';
  const recettes = [450000, 1200000, 950000, 380000, 1800000, 280000, 520000, 320000, 410000, 480000, 175000, 420000, 310000, 265000, 195000];
  const nums = [
    'FAC-2024-001',
    'FAC-2024-002',
    'FAC-2025-003',
    'FAC-2025-004',
    'FAC-2024-005',
    'FAC-2025-006',
    'FAC-2024-007',
    'FAC-2025-008',
    'FAC-2024-009',
    'FAC-2025-010',
    'FAC-2025-011',
    'FAC-2025-012',
    'FAC-2025-013',
    'FAC-2025-014',
    'FAC-2025-015',
  ];
  const rows: ReturnType<typeof invoiceFromRecette>[] = [
    invoiceFromRecette(nums[0], t(0), recettes[0], 'payee', '2024-11-06', { montantPaye: 450000, datePaiement: '2024-11-08', modePaiement: 'Virement' }),
    invoiceFromRecette(nums[1], t(1), recettes[1], 'payee', '2024-12-13', { montantPaye: 1200000, datePaiement: '2024-12-15', modePaiement: 'Chèque' }),
    invoiceFromRecette(nums[2], t(2), recettes[2], 'en_attente', '2025-01-16'),
    invoiceFromRecette(nums[3], t(3), recettes[3], 'en_attente', '2025-02-02'),
    invoiceFromRecette(nums[4], t(4), recettes[4], 'payee', '2024-10-24', { montantPaye: 900000, datePaiement: '2024-10-25', modePaiement: 'Espèces' }),
    invoiceFromRecette(nums[5], t(5), recettes[5], 'en_attente', '2025-01-29'),
    invoiceFromRecette(nums[6], t(6), recettes[6], 'payee', '2024-09-14', { montantPaye: 520000, datePaiement: '2024-09-14', modePaiement: 'Virement' }),
    invoiceFromRecette(nums[7], t(7), recettes[7], 'en_attente', '2025-02-11'),
    invoiceFromRecette(nums[8], t(8), recettes[8], 'payee', '2024-11-27', { montantPaye: 410000, datePaiement: '2024-11-28', modePaiement: 'Espèces' }),
    invoiceFromRecette(nums[9], t(9), recettes[9], 'en_attente', '2025-02-16'),
    invoiceFromRecette(nums[10], t(10), recettes[10], 'en_attente', '2025-01-10'),
    invoiceFromRecette(nums[11], t(11), recettes[11], 'payee', '2025-02-04', { montantPaye: 420000, datePaiement: '2025-02-05', modePaiement: 'Espèces' }),
    invoiceFromRecette(nums[12], t(12), recettes[12], 'en_attente', '2025-02-19'),
    invoiceFromRecette(nums[13], t(13), recettes[13], 'en_attente', '2025-03-01'),
    invoiceFromRecette(nums[14], t(14), recettes[14], 'payee', '2025-01-23', { montantPaye: 195000, datePaiement: '2025-01-23', modePaiement: 'Mobile money' }),
  ];
  return rows;
};

const BANK_ACCOUNTS_SEED = [
  { id: 'bank-1', nom: 'Compte Principal', numeroCompte: 'CM0012345678', banque: 'BICEC', type: 'courant' as const, soldeInitial: 5000000, soldeActuel: 5000000, devise: 'FCFA', iban: 'CM21 0012 3456 7890 1234 5678 90' },
  { id: 'bank-2', nom: 'Compte Épargne', numeroCompte: 'CM0098765432', banque: 'Afriland', type: 'epargne' as const, soldeInitial: 2000000, soldeActuel: 2000000, devise: 'FCFA' },
];

const BANK_TRANSACTIONS_SEED = [
  { id: 'bt-1', compteId: 'bank-1', type: 'depot' as const, montant: 450000, date: '2024-11-08', description: 'Paiement trajet Douala-Yaoundé', reference: 'FAC-2024-001', beneficiaire: 'Marie Ngo' },
  { id: 'bt-2', compteId: 'bank-1', type: 'retrait' as const, montant: 85000, date: '2024-11-05', description: 'Carburant', reference: 'CARB-001', beneficiaire: 'Total Cameroun' },
  { id: 'bt-3', compteId: 'bank-1', type: 'depot' as const, montant: 1200000, date: '2024-12-15', description: 'Paiement Socopa', reference: 'FAC-2024-002', beneficiaire: 'Socopa SA' },
  { id: 'bt-4', compteId: 'bank-1', type: 'retrait' as const, montant: 150000, date: '2025-01-14', description: 'Révision véhicule', reference: 'MAINT-001', beneficiaire: 'Garage Central' },
  { id: 'bt-5', compteId: 'bank-1', type: 'virement' as const, montant: 500000, date: '2025-01-20', description: 'Virement vers épargne', reference: 'VIR-001' },
  { id: 'bt-6', compteId: 'bank-2', type: 'depot' as const, montant: 500000, date: '2025-01-20', description: 'Virement depuis principal', reference: 'VIR-001' },
  { id: 'bt-7', compteId: 'bank-1', type: 'retrait' as const, montant: 320000, date: '2025-01-01', description: 'Assurance annuelle', reference: 'ASS-001', beneficiaire: 'AXA' },
  { id: 'bt-8', compteId: 'bank-1', type: 'depot' as const, montant: 520000, date: '2024-09-14', description: 'Paiement Marie Ngo', reference: 'FAC-2024-007', beneficiaire: 'Marie Ngo' },
  { id: 'bt-9', compteId: 'bank-1', type: 'frais' as const, montant: 5000, date: '2024-12-01', description: 'Frais de tenue de compte', reference: 'FRAIS-001' },
  { id: 'bt-10', compteId: 'bank-1', type: 'depot' as const, montant: 410000, date: '2024-11-28', description: 'Paiement trajet Bertoua-Yaoundé', reference: 'FAC-2024-009', beneficiaire: 'Client' },
  { id: 'bt-11', compteId: 'bank-1', type: 'prelevement' as const, montant: 120000, date: '2025-02-18', description: 'Prélèvement mensuel prêt véhicule', reference: 'PREL-001', beneficiaire: 'BICEC' },
  { id: 'bt-12', compteId: 'bank-1', type: 'depot' as const, montant: 900000, date: '2025-02-20', description: 'Paiement partiel facture Maroua', reference: 'FAC-2024-005', beneficiaire: 'Paul Tchakounte' },
  { id: 'bt-13', compteId: 'bank-1', type: 'depot' as const, montant: 420000, date: '2025-02-05', description: 'Encaissement Douala Express', reference: 'FAC-2025-012', beneficiaire: 'Douala Express SARL' },
  { id: 'bt-14', compteId: 'bank-1', type: 'retrait' as const, montant: 65000, date: '2025-02-22', description: 'Achat pièces détachées', reference: 'PIEC-001', beneficiaire: 'Pièces Mfoundi' },
  { id: 'bt-15', compteId: 'bank-1', type: 'depot' as const, montant: 195000, date: '2025-01-23', description: 'Paiement Kribi', reference: 'FAC-2025-015', beneficiaire: 'Marie Ngo' },
];

const CAISSE_TRANSACTIONS_SEED = [
  { id: 'caisse-1', type: 'entree' as const, montant: 150000, date: '2024-11-08', description: 'Paiement espèces trajet', reference: 'TRJ-001', categorie: 'Recettes trajets' },
  { id: 'caisse-2', type: 'sortie' as const, montant: 25000, date: '2024-11-10', description: 'Frais chauffeur', reference: 'CHF-001', categorie: 'Frais personnel' },
  { id: 'caisse-3', type: 'entree' as const, montant: 200000, date: '2024-12-15', description: 'Acompte client', reference: 'ACP-001', categorie: 'Acomptes' },
  { id: 'caisse-4', type: 'sortie' as const, montant: 45000, date: '2024-12-20', description: 'Vidange', reference: 'MAINT-001', categorie: 'Maintenance' },
  { id: 'caisse-5', type: 'entree' as const, montant: 380000, date: '2025-01-05', description: 'Paiement trajet Bafoussam', reference: 'TRJ-002', categorie: 'Recettes trajets' },
  { id: 'caisse-6', type: 'sortie' as const, montant: 15000, date: '2025-01-12', description: 'Péage', reference: 'PEG-001', categorie: 'Péage' },
  { id: 'caisse-7', type: 'entree' as const, montant: 95000, date: '2025-01-25', description: 'Remboursement chauffeur', reference: 'RMB-001', categorie: 'Divers' },
  { id: 'caisse-8', type: 'sortie' as const, montant: 80000, date: '2025-02-01', description: 'Carburant caisse', reference: 'CARB-002', categorie: 'Carburant' },
  { id: 'caisse-9', type: 'entree' as const, montant: 280000, date: '2025-02-10', description: 'Paiement espèces facture', reference: 'FAC-006', categorie: 'Recettes factures' },
  { id: 'caisse-10', type: 'sortie' as const, montant: 35000, date: '2025-02-14', description: 'Frais divers', reference: 'DIV-001', categorie: 'Divers' },
  { id: 'caisse-11', type: 'entree' as const, montant: 125000, date: '2025-02-12', description: 'Caution livraison retournée', reference: 'CAU-001', categorie: 'Cautions' },
  { id: 'caisse-12', type: 'sortie' as const, montant: 22000, date: '2025-02-17', description: 'Achat fournitures bureau', reference: 'BUR-001', categorie: 'Administratif' },
  { id: 'caisse-13', type: 'entree' as const, montant: 410000, date: '2025-02-19', description: 'Encaissement expédition colis', reference: 'COL-2025-002', categorie: 'Recettes colis' },
  { id: 'caisse-14', type: 'sortie' as const, montant: 180000, date: '2025-02-21', description: 'Avance chauffeur dépannage', reference: 'AVC-001', categorie: 'Avances' },
  { id: 'caisse-15', type: 'entree' as const, montant: 90000, date: '2025-02-25', description: 'Trop-perçu rendu en espèces', reference: 'TPR-001', categorie: 'Divers' },
];

function clientId(thirdParties: { id: string; nom: string; type: string }[], nom: string): string | undefined {
  return thirdParties.find((t) => t.type === 'client' && t.nom === nom)?.id;
}

/** Créances locales (localStorage) — `pret_accorde` = commande / vente sans paiement immédiat lorsque lié à un client. */
function buildCreditsSeed(thirdParties: { id: string; nom: string; type: string }[]): unknown[] {
  const marie = clientId(thirdParties, 'Marie Ngo');
  const socopa = clientId(thirdParties, 'Socopa SA');
  const bollore = clientId(thirdParties, 'Bolloré Transport');
  const paul = clientId(thirdParties, 'Paul Tchakounte');
  const doualaEx = clientId(thirdParties, 'Douala Express SARL');
  const sawa = clientId(thirdParties, 'Sawa Logistics');

  return [
    {
      id: 'cred-1',
      type: 'emprunt',
      intitule: 'Prêt achat Volvo FH16',
      preteur: 'BICEC',
      montantTotal: 15000000,
      montantRembourse: 6000000,
      tauxInteret: 8.5,
      dateDebut: '2023-03-01',
      dateEcheance: '2026-03-01',
      statut: 'en_cours',
      notes: 'Financement bancaire tracteur',
      remboursements: [
        { id: 'r1-1', date: '2023-04-01', montant: 500000, note: 'Mensualité avril 2023' },
        { id: 'r1-2', date: '2023-07-01', montant: 500000, note: 'Mensualité juillet' },
        { id: 'r1-3', date: '2024-01-01', montant: 2000000, note: 'Remboursement anticipé' },
        { id: 'r1-4', date: '2024-06-01', montant: 3000000, note: 'Remboursement partiel' },
      ],
    },
    {
      id: 'cred-2',
      type: 'emprunt',
      intitule: 'Prêt équipement remorques',
      preteur: 'Afriland First Bank',
      montantTotal: 8000000,
      montantRembourse: 8000000,
      tauxInteret: 7.5,
      dateDebut: '2022-06-15',
      dateEcheance: '2024-06-15',
      statut: 'solde',
      notes: 'Entièrement remboursé',
      remboursements: [
        { id: 'r2-1', date: '2023-06-15', montant: 4000000, note: 'Mi-parcours' },
        { id: 'r2-2', date: '2024-06-15', montant: 4000000, note: 'Solde final' },
      ],
    },
    {
      id: 'cred-3',
      type: 'pret_accorde',
      intitule: 'Commande à crédit — livraison Marie Ngo (nov.)',
      preteur: 'Marie Ngo',
      clientTierId: marie,
      montantTotal: 680000,
      montantRembourse: 200000,
      tauxInteret: 0,
      dateDebut: '2024-11-01',
      dateEcheance: '2025-02-28',
      statut: 'en_cours',
      notes: 'Vente transport facturée en différé — fiche client liée',
      remboursements: [{ id: 'r3-1', date: '2024-12-05', montant: 200000, note: 'Acompte virement' }],
    },
    {
      id: 'cred-4',
      type: 'emprunt',
      intitule: 'Ligne de crédit carburant',
      preteur: 'Total Cameroun',
      montantTotal: 3000000,
      montantRembourse: 500000,
      tauxInteret: 0,
      dateDebut: '2025-01-01',
      dateEcheance: '2025-06-30',
      statut: 'en_cours',
      notes: 'Crédit fournisseur 90 jours',
      remboursements: [{ id: 'r4-1', date: '2025-02-15', montant: 500000, note: 'Paiement partiel' }],
    },
    {
      id: 'cred-5',
      type: 'pret_accorde',
      intitule: 'Avance personnelle propriétaire',
      preteur: 'Jean Mbarga',
      montantTotal: 1500000,
      montantRembourse: 750000,
      tauxInteret: 5,
      dateDebut: '2024-09-01',
      dateEcheance: '2025-03-01',
      statut: 'en_retard',
      notes: 'Pas une fiche client — encours hors plafond client',
      remboursements: [
        { id: 'r5-1', date: '2024-10-01', montant: 250000, note: 'Mensualité octobre' },
        { id: 'r5-2', date: '2024-11-01', montant: 250000, note: 'Mensualité novembre' },
        { id: 'r5-3', date: '2024-12-01', montant: 250000, note: 'Mensualité décembre' },
      ],
    },
    {
      id: 'cred-6',
      type: 'emprunt',
      intitule: 'Prêt réparation moteur LT-3456',
      preteur: 'Pierre Essono',
      montantTotal: 600000,
      montantRembourse: 600000,
      tauxInteret: 0,
      dateDebut: '2024-05-01',
      dateEcheance: '2024-11-01',
      statut: 'solde',
      notes: 'Avance du propriétaire remboursée',
      remboursements: [
        { id: 'r6-1', date: '2024-08-01', montant: 300000, note: 'Mi-paiement' },
        { id: 'r6-2', date: '2024-11-01', montant: 300000, note: 'Solde' },
      ],
    },
    {
      id: 'cred-7',
      type: 'pret_accorde',
      intitule: 'Acompte commande Socopa (déduit sur facture)',
      preteur: 'Socopa SA',
      clientTierId: socopa,
      montantTotal: 500000,
      montantRembourse: 500000,
      tauxInteret: 0,
      dateDebut: '2024-08-01',
      dateEcheance: '2024-12-31',
      statut: 'solde',
      notes: 'Créance commerciale soldée — voir FAC-2024-002',
      remboursements: [{ id: 'r7-1', date: '2024-12-15', montant: 500000, note: 'Compensation facture' }],
    },
    {
      id: 'cred-8',
      type: 'emprunt',
      intitule: 'Financement renouvellement flotte',
      preteur: 'SCB Cameroun',
      montantTotal: 25000000,
      montantRembourse: 2500000,
      tauxInteret: 9,
      dateDebut: '2025-01-15',
      dateEcheance: '2028-01-15',
      statut: 'en_cours',
      notes: 'Trois nouveaux tracteurs',
      remboursements: [{ id: 'r8-1', date: '2025-02-15', montant: 2500000, note: 'Première mensualité' }],
    },
    {
      id: 'cred-9',
      type: 'pret_accorde',
      intitule: 'Avance chauffeur (déduction paie)',
      preteur: 'Roger Abega',
      montantTotal: 180000,
      montantRembourse: 60000,
      tauxInteret: 0,
      dateDebut: '2025-02-01',
      dateEcheance: '2025-05-01',
      statut: 'en_cours',
      notes: 'Pas de fiche client — interne chauffeur',
      remboursements: [{ id: 'r9-1', date: '2025-03-01', montant: 60000, note: 'Déduction mars' }],
    },
    {
      id: 'cred-10',
      type: 'emprunt',
      intitule: 'Assurance flotte annuelle',
      preteur: 'AXA Cameroun',
      montantTotal: 1200000,
      montantRembourse: 400000,
      tauxInteret: 0,
      dateDebut: '2025-01-01',
      dateEcheance: '2025-12-31',
      statut: 'en_cours',
      notes: 'Paiement trimestriel',
      remboursements: [{ id: 'r10-1', date: '2025-01-01', montant: 400000, note: 'Trimestre 1' }],
    },
    {
      id: 'cred-11',
      type: 'pret_accorde',
      intitule: 'Vente à crédit — palettes Douala Express',
      preteur: 'Douala Express SARL',
      clientTierId: doualaEx,
      montantTotal: 380000,
      montantRembourse: 380000,
      tauxInteret: 0,
      dateDebut: '2025-01-20',
      dateEcheance: '2025-02-15',
      statut: 'solde',
      notes: 'Petit montant sous plafond 500k — soldé',
      remboursements: [{ id: 'r11-1', date: '2025-02-05', montant: 380000, note: 'Règlement espèces' }],
    },
    {
      id: 'cred-12',
      type: 'pret_accorde',
      intitule: 'Commande Bolloré — facturation 60 jours',
      preteur: 'Bolloré Transport',
      clientTierId: bollore,
      montantTotal: 4200000,
      montantRembourse: 800000,
      tauxInteret: 0,
      dateDebut: '2024-12-01',
      dateEcheance: '2025-02-01',
      statut: 'en_retard',
      notes: 'Gros encours — utile pour filtres « en retard »',
      remboursements: [
        { id: 'r12-1', date: '2025-01-10', montant: 300000, note: 'Virement partiel' },
        { id: 'r12-2', date: '2025-01-25', montant: 500000, note: 'Acompte' },
      ],
    },
    {
      id: 'cred-13',
      type: 'pret_accorde',
      intitule: 'Sawa — en-cours proche du plafond (3,5 M)',
      preteur: 'Sawa Logistics',
      clientTierId: sawa,
      montantTotal: 3100000,
      montantRembourse: 400000,
      tauxInteret: 0,
      dateDebut: '2025-01-05',
      dateEcheance: '2025-04-30',
      statut: 'en_cours',
      notes: 'Tester l’alerte plafond sur fiche client',
      remboursements: [{ id: 'r13-1', date: '2025-02-01', montant: 400000, note: 'Règlement partiel' }],
    },
    {
      id: 'cred-14',
      type: 'pret_accorde',
      intitule: 'Pharmacentre — livraison sans lien UUID (nom seul)',
      preteur: 'Pharmacentre',
      montantTotal: 220000,
      montantRembourse: 0,
      tauxInteret: 0,
      dateDebut: '2025-02-10',
      dateEcheance: '2025-03-10',
      statut: 'en_cours',
      notes: 'Démo : pas de clientTierId — rapprochement par nom sur trajets / colis',
      remboursements: [],
    },
    {
      id: 'cred-15',
      type: 'pret_accorde',
      intitule: 'Paul Tchakounte — dépassement typique de plafond serré',
      preteur: 'Paul Tchakounte',
      clientTierId: paul,
      montantTotal: 950000,
      montantRembourse: 100000,
      tauxInteret: 0,
      dateDebut: '2025-02-01',
      dateEcheance: '2025-03-15',
      statut: 'en_cours',
      notes: 'Plafond client 1,2 M — encours élevé pour tests',
      remboursements: [{ id: 'r15-1', date: '2025-02-10', montant: 100000, note: 'Premier paiement' }],
    },
    {
      id: 'cred-16',
      type: 'pret_accorde',
      intitule: 'Marie Ngo — 2e ligne commande (cumul encours)',
      preteur: 'Marie Ngo',
      clientTierId: marie,
      montantTotal: 350000,
      montantRembourse: 0,
      tauxInteret: 0,
      dateDebut: '2025-02-20',
      dateEcheance: '2025-04-01',
      statut: 'en_cours',
      notes: 'À cumuler avec cred-3 pour voir l’encours total sur la fiche',
      remboursements: [],
    },
  ].map((row) => {
    const o = row as Record<string, unknown>;
    if (o.clientTierId === undefined) delete o.clientTierId;
    return o;
  });
}

function bankBalancesFromTransactions(): { bal1: number; bal2: number } {
  let bal1 = 5000000;
  let bal2 = 2000000;
  for (const t of BANK_TRANSACTIONS_SEED) {
    if (t.compteId === 'bank-1') {
      if (t.type === 'depot' || t.type === 'virement') bal1 += t.montant;
      else bal1 -= t.montant;
    } else if (t.compteId === 'bank-2') {
      if (t.type === 'depot' || t.type === 'virement') bal2 += t.montant;
      else bal2 -= t.montant;
    }
  }
  return { bal1, bal2 };
}

/** Rafraîchit les listes en mémoire après purge ou seed (camions, trajets, etc.). */
export type DemoDataRefreshCallbacks = {
  refreshTrucks?: () => Promise<void>;
  refreshDrivers?: () => Promise<void>;
  refreshTrips?: () => Promise<void>;
  refreshParcelExpeditions?: () => Promise<void>;
  refreshExpenses?: () => Promise<void>;
  refreshInvoices?: () => Promise<void>;
  refreshThirdParties?: () => Promise<void>;
};

async function refreshDemoLists(c?: DemoDataRefreshCallbacks): Promise<void> {
  if (!c) return;
  try {
    await Promise.all([
      c.refreshTrucks?.(),
      c.refreshDrivers?.(),
      c.refreshTrips?.(),
      c.refreshParcelExpeditions?.(),
      c.refreshExpenses?.(),
      c.refreshInvoices?.(),
      c.refreshThirdParties?.(),
    ]);
  } catch {
    // Ignore
  }
}

async function purgeBackendAndLocalDemoCaches(): Promise<{ error?: string }> {
  try {
    await adminApi.purge();
    localStorage.removeItem('bank_accounts');
    localStorage.removeItem('bank_transactions');
    localStorage.removeItem('caisse_transactions');
    localStorage.removeItem('caisse_solde_initial');
    localStorage.removeItem('credits_data');
    return {};
  } catch (e) {
    return { error: `Purge: ${e instanceof Error ? e.message : 'Erreur'}` };
  }
}

/**
 * Supprime toutes les données applicatives (API) et vide banque / caisse / créances en localStorage,
 * sans recréer le jeu de démonstration.
 */
export async function clearDemoData(
  refreshCallbacks?: DemoDataRefreshCallbacks,
): Promise<{ success: string[]; errors: string[] }> {
  const success: string[] = [];
  const errors: string[] = [];
  const p = await purgeBackendAndLocalDemoCaches();
  if (p.error) errors.push(p.error);
  else success.push('Purge base de données et caches locaux (créances incluses)');
  await refreshDemoLists(refreshCallbacks);
  return { success, errors };
}

/**
 * Exécute le seed complet.
 * - API: ThirdParties → Drivers → Trucks → Trips → Parcel expeditions → Expenses → Invoices
 * - localStorage: Banque, Caisse, Crédits (toujours réinitialisés avec le jeu de démo)
 */
export async function runSeed(refreshCallbacks?: DemoDataRefreshCallbacks): Promise<{
  success: string[];
  errors: string[];
}> {
  const success: string[] = [];
  const errors: string[] = [];

  const purgeResult = await purgeBackendAndLocalDemoCaches();
  if (purgeResult.error) errors.push(purgeResult.error);
  else success.push('Purge base de données et caches locaux (créances incluses)');

  try {
    for (const t of TIERS_SEED) {
      await thirdPartiesApi.create(t);
    }
    success.push(`Tiers (${TIERS_SEED.length})`);
  } catch (e) {
    errors.push(`Tiers: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  try {
    for (const d of DRIVERS_SEED) {
      await driversApi.create(d);
    }
    success.push(`Chauffeurs (${DRIVERS_SEED.length})`);
  } catch (e) {
    errors.push(`Chauffeurs: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  let thirdParties: { id: string; type: string; nom: string }[] = [];
  let drivers: { id: string }[] = [];
  let trucks: { id: string; type: string }[] = [];
  let trips: { id: string }[] = [];

  try {
    thirdParties = await thirdPartiesApi.getAll();
    drivers = await driversApi.getAll();
  } catch {
    // Continue sans IDs si API échoue
  }

  const proprietaireIds = thirdParties.filter((t: { type: string }) => t.type === 'proprietaire').map((t: { id: string }) => t.id);
  const fournisseurIds = thirdParties.filter((t: { type: string }) => t.type === 'fournisseur').map((t: { id: string }) => t.id);
  const chauffeurIds = drivers.map((d: { id: string }) => d.id);

  try {
    const trucksSeed = getTrucksSeed(proprietaireIds.length ? proprietaireIds : ['', '', '', '']);
    for (const t of trucksSeed) {
      const payload = { ...t };
      if (!payload.proprietaireId) delete payload.proprietaireId;
      await trucksApi.create(payload);
    }
    trucks = await trucksApi.getAll();
    success.push(`Camions (${trucksSeed.length})`);
  } catch (e) {
    errors.push(`Camions: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  const tracteurIds = trucks.filter((t: { type: string }) => t.type === 'tracteur').map((t: { id: string }) => t.id);
  const remorqueIds = trucks.filter((t: { type: string }) => t.type === 'remorqueuse').map((t: { id: string }) => t.id);
  const camionIds = tracteurIds.length ? tracteurIds : trucks.map((t: { id: string }) => t.id);

  try {
    const tripsSeed = getTripsSeed(
      chauffeurIds.length ? chauffeurIds : Array(15).fill(chauffeurIds[0] || ''),
      tracteurIds.length ? tracteurIds : Array(15).fill(tracteurIds[0] || ''),
      remorqueIds.length >= 2 ? remorqueIds : [],
    );
    for (const t of tripsSeed) {
      const payload: Record<string, unknown> = { ...t };
      if (!payload.remorqueuseId) delete payload.remorqueuseId;
      if (!payload.client) delete payload.client;
      if (!payload.marchandise) delete payload.marchandise;
      if (!payload.prefinancement) delete payload.prefinancement;
      await tripsApi.create(payload);
    }
    trips = await tripsApi.getAll();
    success.push(`Trajets (${tripsSeed.length})`);
  } catch (e) {
    errors.push(`Trajets: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  const tripIds = trips.map((t: { id: string }) => t.id);

  try {
    const ch0 = chauffeurIds[0] || '';
    const tr0 = tracteurIds[0] || '';
    const rem0 = remorqueIds[0];
    const parcels = [
      {
        reference: 'COL-2025-001',
        origine: 'Douala',
        destination: 'Yaoundé',
        tracteurId: tr0,
        remorqueuseId: rem0,
        chauffeurId: ch0,
        dateDepart: '2025-02-01',
        dateArrivee: '2025-02-02',
        statut: 'termine' as const,
        commissionPct: 8,
        lots: [
          { clients: 'Marie Ngo — ligne AKWA', unite: 'colis', quantite: 24, prixUnitaire: 2500 },
          { clients: 'Socopa SA — pièces', unite: 'palette', quantite: 2, prixUnitaire: 45000 },
        ],
      },
      {
        reference: 'COL-2025-002',
        origine: 'Douala',
        destination: 'Bafoussam',
        tracteurId: tracteurIds[1] || tr0,
        remorqueuseId: remorqueIds[1] || rem0,
        chauffeurId: chauffeurIds[1] || ch0,
        dateDepart: '2025-02-08',
        dateArrivee: '2025-02-09',
        statut: 'termine' as const,
        commissionPct: 10,
        lots: [{ clients: 'Pharmacentre', unite: 'carton', quantite: 80, prixUnitaire: 1200 }],
      },
      {
        reference: 'COL-2025-003',
        origine: 'Yaoundé',
        destination: 'Douala',
        chauffeurId: chauffeurIds[2] || ch0,
        dateDepart: '2025-02-20',
        statut: 'en_cours' as const,
        lots: [
          { clients: 'Sawa Logistics', unite: 'm³', quantite: 12, prixUnitaire: 15000 },
          { clients: 'Douala Express SARL', unite: 'colis', quantite: 40, prixUnitaire: 1800 },
        ],
      },
      {
        reference: 'COL-2024-099',
        origine: 'Douala',
        destination: 'Kribi',
        tracteurId: tr0,
        chauffeurId: chauffeurIds[3] || ch0,
        dateDepart: '2024-12-18',
        dateArrivee: '2024-12-18',
        statut: 'annule' as const,
        description: 'Annulé — client a reporté',
        lots: [{ clients: 'Bolloré Transport', unite: 'colis', quantite: 5, prixUnitaire: 5000 }],
      },
      {
        reference: 'COL-2025-004',
        origine: 'Douala',
        destination: 'Garoua',
        tracteurId: tracteurIds[2] || tr0,
        remorqueuseId: rem0,
        chauffeurId: chauffeurIds[4] || ch0,
        dateDepart: '2025-03-05',
        statut: 'planifie' as const,
        lots: [{ clients: 'Paul Tchakounte', unite: 'tonne', quantite: 8, prixUnitaire: 85000 }],
      },
    ];
    let peOk = 0;
    for (const p of parcels) {
      const body: Record<string, unknown> = { ...p };
      if (!body.tracteurId) delete body.tracteurId;
      if (!body.remorqueuseId) delete body.remorqueuseId;
      await parcelExpeditionsApi.create(body as Parameters<typeof parcelExpeditionsApi.create>[0]);
      peOk += 1;
    }
    success.push(`Expéditions colis (${peOk})`);
  } catch (e) {
    errors.push(`Expéditions colis: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  try {
    const expensesSeed = getExpensesSeed(
      camionIds.length >= 5 ? camionIds : Array(15).fill(camionIds[0] || ''),
      tripIds.length >= 15 ? tripIds : Array(15).fill(tripIds[0] || ''),
      chauffeurIds.length ? chauffeurIds : Array(15).fill(chauffeurIds[0] || ''),
      fournisseurIds.length >= 3 ? fournisseurIds : [],
    );
    for (const ex of expensesSeed) {
      const payload: Record<string, unknown> = { ...ex };
      if (!payload.tripId) delete payload.tripId;
      if (!payload.chauffeurId) delete payload.chauffeurId;
      if (!payload.fournisseurId) delete payload.fournisseurId;
      if (!payload.quantite) delete payload.quantite;
      if (!payload.prixUnitaire) delete payload.prixUnitaire;
      await expensesApi.create(payload as Parameters<typeof expensesApi.create>[0]);
    }
    success.push(`Dépenses (${expensesSeed.length})`);
  } catch (e) {
    errors.push(`Dépenses: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  try {
    const invoicesSeed = getInvoicesSeed(tripIds.length >= 15 ? tripIds : Array(15).fill(tripIds[0] || ''));
    for (const inv of invoicesSeed) {
      const payload: Record<string, unknown> = { ...inv };
      if (!payload.trajetId) delete payload.trajetId;
      if (!payload.datePaiement) delete payload.datePaiement;
      if (!payload.modePaiement) delete payload.modePaiement;
      if (!payload.montantPaye) delete payload.montantPaye;
      await invoicesApi.create(payload as Parameters<typeof invoicesApi.create>[0]);
    }
    success.push(`Factures (${invoicesSeed.length})`);
  } catch (e) {
    errors.push(`Factures: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  try {
    const { bal1, bal2 } = bankBalancesFromTransactions();
    const accountsWithBalance = [
      { ...BANK_ACCOUNTS_SEED[0], soldeActuel: bal1 },
      { ...BANK_ACCOUNTS_SEED[1], soldeActuel: bal2 },
    ];
    localStorage.setItem('bank_accounts', JSON.stringify(accountsWithBalance));
    localStorage.setItem('bank_transactions', JSON.stringify(BANK_TRANSACTIONS_SEED));
    success.push(`Banque (2 comptes, ${BANK_TRANSACTIONS_SEED.length} transactions)`);
  } catch (e) {
    errors.push(`Banque: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  try {
    localStorage.setItem('caisse_transactions', JSON.stringify(CAISSE_TRANSACTIONS_SEED));
    localStorage.setItem('caisse_solde_initial', '500000');
    success.push(`Caisse (${CAISSE_TRANSACTIONS_SEED.length} transactions)`);
  } catch (e) {
    errors.push(`Caisse: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  try {
    const creditsPayload = buildCreditsSeed(thirdParties);
    localStorage.setItem('credits_data', JSON.stringify(creditsPayload));
    success.push(`Créances démo (${creditsPayload.length} lignes, localStorage)`);
  } catch (e) {
    errors.push(`Créances: ${e instanceof Error ? e.message : 'Erreur'}`);
  }

  await refreshDemoLists(refreshCallbacks);

  return { success, errors };
}
