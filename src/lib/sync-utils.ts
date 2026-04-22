/**
 * Utilitaires de synchronisation des données entre les modules
 */

import {
  Trip,
  TripStatus,
  Expense,
  Driver,
  Truck,
  Invoice,
  DriverTransaction,
  ParcelExpedition,
} from '@/contexts/AppContext';

/** Libellé français du statut de trajet (exports, tableaux). */
export const formatTripStatusFr = (statut: TripStatus): string => {
  const labels: Record<TripStatus, string> = {
    planifie: 'Planifié',
    en_cours: 'En cours',
    termine: 'Terminé',
    annule: 'Annulé',
  };
  return labels[statut] ?? statut;
};

/** Compte les trajets d’un chauffeur (total et annulés). */
export const getDriverTripCounts = (driverId: string, trips: Trip[]) => {
  const list = trips.filter((t) => t.chauffeurId === driverId);
  return {
    total: list.length,
    termines: list.filter((t) => t.statut === 'termine').length,
    annules: list.filter((t) => t.statut === 'annule').length,
  };
};

/**
 * Synchronise les dépenses avec les transactions des chauffeurs
 */
export const syncExpenseWithDriver = (
  expense: Expense,
  drivers: Driver[],
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>
): void => {
  if (!expense.chauffeurId) return;

  const driver = drivers.find(d => d.id === expense.chauffeurId);
  if (!driver) return;

  // Vérifier si la transaction existe déjà
  const existingTransaction = driver.transactions.find(
    t => t.id === `expense_${expense.id}`
  );

  if (!existingTransaction) {
    const driverTransaction: DriverTransaction = {
      id: `expense_${expense.id}`,
      type: 'sortie',
      montant: expense.montant,
      date: expense.date,
      description: `Dépense: ${expense.description} (${expense.categorie})`,
    };

    setDrivers(drivers.map(d =>
      d.id === expense.chauffeurId
        ? { ...d, transactions: [...d.transactions, driverTransaction] }
        : d
    ));
  }
};

/**
 * Supprime la transaction du chauffeur quand une dépense est supprimée
 */
export const removeExpenseFromDriver = (
  expenseId: string,
  chauffeurId: string | undefined,
  drivers: Driver[],
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>
): void => {
  if (!chauffeurId) return;

  setDrivers(drivers.map(d =>
    d.id === chauffeurId
      ? {
          ...d,
          transactions: d.transactions.filter(t => t.id !== `expense_${expenseId}`)
        }
      : d
  ));
};

/**
 * Calcule le montant total payé pour un trajet à partir de toutes ses factures
 */
export const calculatePaidAmountForTrip = (tripId: string, invoices: Invoice[]): number => {
  return invoices
    .filter(inv => inv.trajetId === tripId)
    .reduce((sum, inv) => sum + (inv.montantPaye || 0), 0);
};

/** Montant encaissé sur une expédition, à partir des factures liées. */
export const calculatePaidAmountForParcelExpedition = (
  expeditionId: string,
  invoices: Invoice[],
): number => {
  return invoices
    .filter((inv) => inv.parcelExpeditionId === expeditionId)
    .reduce((sum, inv) => sum + (inv.montantPaye || 0), 0);
};

/**
 * Somme des restes à payer sur toutes les factures (argent dû par les clients, pas encore en caisse/banque).
 * Utile pour distinguer liquidités vs « hors trésorerie ».
 */
export const getTotalCreancesClients = (invoices: Invoice[]): number => {
  return invoices.reduce((sum, inv) => {
    const paye = inv.montantPaye ?? 0;
    const reste = inv.montantTTC - paye;
    return sum + (reste > 0 ? reste : 0);
  }, 0);
};

/**
 * Met à jour les recettes d'un trajet quand une facture est payée (partiellement ou complètement)
 * La recette du trajet représente le montant total payé par le client
 */
export const syncInvoicePaymentWithTrip = (
  invoice: Invoice,
  trips: Trip[],
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>,
  invoices: Invoice[]
): void => {
  const trip = trips.find(t => t.id === invoice.trajetId);
  if (!trip) return;

  // Calculer le montant total payé pour ce trajet
  const totalPaid = calculatePaidAmountForTrip(invoice.trajetId, invoices);
  
  // Mettre à jour la recette du trajet avec le montant total payé
  setTrips(trips.map(t =>
    t.id === invoice.trajetId
      ? { ...t, recette: totalPaid }
      : t
  ));
};

/**
 * Vérifie si un camion est actuellement utilisé dans un trajet en cours
 */
export const isTruckInUse = (
  truckId: string,
  trips: Trip[],
  expeditions: ParcelExpedition[] = [],
): boolean => {
  const usedByTrip = trips.some(
    (trip) =>
      (trip.tracteurId === truckId || trip.remorqueuseId === truckId) &&
      (trip.statut === 'en_cours' || trip.statut === 'planifie'),
  );
  if (usedByTrip) return true;
  return expeditions.some(
    (ex) =>
      (ex.tracteurId === truckId || ex.remorqueuseId === truckId) &&
      (ex.statut === 'en_cours' || ex.statut === 'planifie'),
  );
};

/**
 * Vérifie si un chauffeur est actuellement en mission
 */
export const isDriverOnMission = (
  driverId: string,
  trips: Trip[],
  expeditions: ParcelExpedition[] = [],
): boolean => {
  const onTrip = trips.some(
    (trip) =>
      trip.chauffeurId === driverId &&
      (trip.statut === 'en_cours' || trip.statut === 'planifie'),
  );
  if (onTrip) return true;
  return expeditions.some(
    (ex) =>
      ex.chauffeurId === driverId &&
      (ex.statut === 'en_cours' || ex.statut === 'planifie'),
  );
};

/**
 * Met à jour automatiquement le statut d'un camion en fonction de son utilisation
 */
export const updateTruckStatus = (
  truck: Truck,
  trips: Trip[],
  trucks: Truck[],
  setTrucks: React.Dispatch<React.SetStateAction<Truck[]>>
): void => {
  const inUse = isTruckInUse(truck.id, trips);
  
  // Si le camion est utilisé mais marqué inactif, on le passe en actif
  if (inUse && truck.statut === 'inactif') {
    setTrucks(trucks.map(t =>
      t.id === truck.id ? { ...t, statut: 'actif' } : t
    ));
  }
};

/** Entrée d’affichage pour la liste des transactions (trajet, dépense ou manuelle) */
export interface DriverTransactionDisplay {
  id: string;
  type: 'apport' | 'sortie';
  montant: number;
  date: string;
  description: string;
  source: 'trajet' | 'depense' | 'manuel';
}

/**
 * Calcule les statistiques d'un chauffeur à partir des trajets, dépenses et transactions manuelles.
 * - Apports = recettes des trajets terminés du chauffeur + transactions manuelles type "apport"
 * - Sorties = dépenses imputées au chauffeur + transactions manuelles type "sortie"
 */
export const calculateDriverStatsFromTripsAndExpenses = (
  driverId: string,
  driver: Driver,
  trips: Trip[],
  expenses: Expense[],
  expeditions: ParcelExpedition[] = [],
  invoices: Invoice[] = [],
) => {
  const driverTrips = trips.filter(
    t => t.chauffeurId === driverId && t.statut === 'termine'
  );
  const driverExpenseIds = new Set(trips.filter(t => t.chauffeurId === driverId).map(t => t.id));
  const driverExpenses = expenses.filter(
    e => e.chauffeurId === driverId || (e.tripId && driverExpenseIds.has(e.tripId))
  );

  const driverExpeditions = expeditions.filter(
    (ex) => ex.chauffeurId === driverId && ex.statut === 'termine',
  );
  const apportsFromTrips = driverTrips.reduce((sum, t) => sum + t.recette, 0);
  const apportsFromExpeditions = invoices.length
    ? driverExpeditions.reduce(
        (sum, ex) => sum + calculatePaidAmountForParcelExpedition(ex.id, invoices),
        0,
      )
    : driverExpeditions.reduce((sum, ex) => sum + sumParcelExpeditionLotsCa(ex), 0);
  const apportsFromManual = driver.transactions
    .filter(t => t.type === 'apport')
    .reduce((sum, t) => sum + t.montant, 0);
  const apports = apportsFromTrips + apportsFromExpeditions + apportsFromManual;

  const sortiesFromExpenses = driverExpenses.reduce((sum, e) => sum + e.montant, 0);
  const sortiesFromManual = driver.transactions
    .filter(t => t.type === 'sortie')
    .reduce((sum, t) => sum + t.montant, 0);
  const sorties = sortiesFromExpenses + sortiesFromManual;

  const balance = apports - sorties;

  const fromTrips: DriverTransactionDisplay[] = driverTrips.map(t => ({
    id: `trip_${t.id}`,
    type: 'apport',
    montant: t.recette,
    date: t.dateArrivee || t.dateDepart,
    description: `Trajet: ${t.origine} → ${t.destination}`,
    source: 'trajet',
  }));
  const fromExpenses: DriverTransactionDisplay[] = driverExpenses.map(e => ({
    id: `expense_${e.id}`,
    type: 'sortie',
    montant: e.montant,
    date: e.date,
    description: `Dépense: ${e.description} (${e.categorie})`,
    source: 'depense',
  }));
  const fromExpeditions: DriverTransactionDisplay[] = driverExpeditions.map((ex) => ({
    id: `parcel_${ex.id}`,
    type: 'apport',
    montant: invoices.length
      ? calculatePaidAmountForParcelExpedition(ex.id, invoices)
      : sumParcelExpeditionLotsCa(ex),
    date: ex.dateArrivee || ex.dateDepart,
    description: `Expédition: ${ex.origine} → ${ex.destination}`,
    source: 'trajet',
  }));
  const fromManual: DriverTransactionDisplay[] = driver.transactions.map(t => ({
    id: t.id,
    type: t.type,
    montant: t.montant,
    date: t.date,
    description: t.description,
    source: 'manuel',
  }));

  const allTransactions: DriverTransactionDisplay[] = [
    ...fromTrips,
    ...fromExpeditions,
    ...fromExpenses,
    ...fromManual,
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    apports,
    sorties,
    balance,
    apportsFromTrips,
    apportsFromExpeditions,
    apportsFromManual,
    sortiesFromExpenses,
    sortiesFromManual,
    allTransactions,
  };
};

/**
 * Calcule les statistiques d'un chauffeur (uniquement transactions enregistrées).
 * Conservé pour compatibilité (ex: confirmation de suppression).
 */
export const calculateDriverStats = (driver: Driver) => {
  const apports = driver.transactions
    .filter(t => t.type === 'apport')
    .reduce((sum, t) => sum + t.montant, 0);
  
  const sorties = driver.transactions
    .filter(t => t.type === 'sortie')
    .reduce((sum, t) => sum + t.montant, 0);
  
  const balance = apports - sorties;
  
  return { apports, sorties, balance };
};

/**
 * Calcule les statistiques d'un camion
 * Utilise les montants payés pour calculer le chiffre d’affaires / l’encaissement
 */
export const calculateTruckStats = (
  truckId: string, 
  trips: Trip[], 
  expenses: Expense[],
  invoices?: Invoice[],
  expeditions: ParcelExpedition[] = [],
) => {
  const allLinked = trips.filter(
    t => t.tracteurId === truckId || t.remorqueuseId === truckId,
  );
  const truckTripsTermines = allLinked.filter(t => t.statut === 'termine');
  const tripsCancelledCount = allLinked.filter(t => t.statut === 'annule').length;
  const tripsTotalCount = allLinked.length;

  const linkedExpeditions = expeditions.filter(
    (ex) => ex.tracteurId === truckId || ex.remorqueuseId === truckId,
  );
  const expeditionsTerminees = linkedExpeditions.filter((ex) => ex.statut === 'termine');
  // Chiffre d’affaires (montants payés) : trajets + expéditions terminés
  const revenueTrips = invoices
    ? truckTripsTermines.reduce((sum, t) => sum + calculatePaidAmountForTrip(t.id, invoices), 0)
    : truckTripsTermines.reduce((sum, t) => sum + t.recette, 0);
  const revenueExpeditions = invoices
    ? expeditionsTerminees.reduce(
        (sum, ex) => sum + calculatePaidAmountForParcelExpedition(ex.id, invoices),
        0,
      )
    : expeditionsTerminees.reduce((sum, ex) => sum + sumParcelExpeditionLotsCa(ex), 0);
  const revenue = revenueTrips + revenueExpeditions;

  const truckExpenses = expenses
    .filter(e => e.camionId === truckId)
    .reduce((sum, e) => sum + e.montant, 0);

  const profit = revenue - truckExpenses;
  /** Nombre de missions terminées (trajets + expéditions). */
  const tripsCount = truckTripsTermines.length + expeditionsTerminees.length;

  return {
    revenue,
    expenses: truckExpenses,
    profit,
    tripsCount,
    tripsCancelledCount,
    tripsTotalCount,
  };
};

/**
 * Vérifie si un trajet peut être supprimé (pas de facture associée)
 */
export const canDeleteTrip = (tripId: string, invoices: Invoice[]): boolean => {
  return !invoices.some(inv => inv.trajetId === tripId);
};

/**
 * Calcule les dépenses et le solde d'un trajet
 * Utilise les montants payés (recette) plutôt que le montant contractuel
 */
export const calculateTripStats = (
  tripId: string,
  expenses: Expense[],
  trip: Trip,
  invoices?: Invoice[],
) => {
  const tripLinked = expenses.filter((e) => e.tripId === tripId);
  const prefinFromExpenses = tripLinked
    .filter((e) => e.categorie === 'Préfinancement')
    .reduce((sum, e) => sum + e.montant, 0);
  /** Montant préfinancé : champ trajet (source de vérité à la création), sinon somme des dépenses « Préfinancement » (données anciennes). */
  const prefinancement =
    trip.prefinancement && trip.prefinancement > 0 ? trip.prefinancement : prefinFromExpenses;

  /** Dépenses d’exploitation liées au trajet, sans les lignes « Préfinancement » (déjà reflétées dans `prefinancement`). */
  const tripExpenses = tripLinked
    .filter((e) => e.categorie !== 'Préfinancement')
    .reduce((sum, e) => sum + e.montant, 0);

  const recette = invoices ? calculatePaidAmountForTrip(tripId, invoices) : trip.recette;

  const solde = recette - prefinancement - tripExpenses;

  return {
    recette,
    prefinancement,
    expenses: tripExpenses,
    solde,
    expensesCount: tripLinked.filter((e) => e.categorie !== 'Préfinancement').length,
    /** Toutes les lignes liées (y compris préfinancement), pour afficher le détail / bouton œil. */
    linkedExpensesCount: tripLinked.length,
  };
};

/**
 * Supprime toutes les dépenses liées à un camion supprimé
 */
export const deleteExpensesForTruck = (
  truckId: string,
  expenses: Expense[],
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>,
  drivers: Driver[],
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>
): void => {
  const truckExpenses = expenses.filter(e => e.camionId === truckId);
  
  // Supprimer les transactions liées des chauffeurs
  truckExpenses.forEach(expense => {
    if (expense.chauffeurId) {
      removeExpenseFromDriver(expense.id, expense.chauffeurId, drivers, setDrivers);
    }
  });
  
  // Supprimer les dépenses
  setExpenses(expenses.filter(e => e.camionId !== truckId));
};

/**
 * Vérifie si un chauffeur peut être supprimé (pas de trajet actif ou planifié)
 */
export const canDeleteDriver = (driverId: string, trips: Trip[]): boolean => {
  return !trips.some(trip =>
    trip.chauffeurId === driverId &&
    (trip.statut === 'en_cours' || trip.statut === 'planifie')
  );
};

/**
 * Obtient le nom complet d'un chauffeur
 */
export const getDriverFullName = (driverId: string, drivers: Driver[]): string => {
  const driver = drivers.find(d => d.id === driverId);
  return driver ? `${driver.prenom} ${driver.nom}` : 'Chauffeur inconnu';
};

/**
 * Obtient l'immatriculation d'un camion
 */
export const getTruckLabel = (truckId: string, trucks: Truck[]): string => {
  const truck = trucks.find(t => t.id === truckId);
  return truck ? `${truck.immatriculation} (${truck.modele})` : 'Camion inconnu';
};

/**
 * Génère un numéro de facture unique
 */
export const generateInvoiceNumber = (invoices: Invoice[]): string => {
  const year = new Date().getFullYear();
  const count = invoices.length + 1;
  return `FAC-${year}-${String(count).padStart(3, '0')}`;
};

/**
 * Calcule le montant total des factures en attente
 */
export const calculatePendingInvoicesAmount = (invoices: Invoice[]): number => {
  return invoices
    .filter(inv => inv.statut === 'en_attente')
    .reduce((sum, inv) => sum + inv.montantTTC, 0);
};

/**
 * Obtient les trajets disponibles pour facturation (sans facture existante)
 * Permet de créer une facture pour n'importe quel trajet à tout moment
 */
export const getAvailableTripsForInvoicing = (trips: Trip[], invoices: Invoice[]): Trip[] => {
  const invoicedTripIds = new Set(invoices.map(inv => inv.trajetId).filter((id): id is string => !!id));
  return trips.filter(trip => 
    trip.recette > 0 &&
    !invoicedTripIds.has(trip.id)
  );
};

/** CA transport facturable sur une expédition colis (somme des lignes). */
export const sumParcelExpeditionLotsCa = (ex: ParcelExpedition): number => {
  if (!ex?.lots?.length) return 0;
  return ex.lots.reduce((s, l) => s + (Number.isFinite(l.montant) ? l.montant : 0), 0);
};

/** Expéditions colis sans facture, avec CA lignes &gt; 0 (hors annulées). */
export const getAvailableParcelExpeditionsForInvoicing = (
  expeditions: ParcelExpedition[],
  invoices: Invoice[],
): ParcelExpedition[] => {
  const invoicedIds = new Set(
    invoices.map((inv) => inv.parcelExpeditionId).filter((id): id is string => !!id),
  );
  return expeditions.filter(
    (ex) =>
      ex.statut !== 'annule' &&
      sumParcelExpeditionLotsCa(ex) > 0 &&
      !invoicedIds.has(ex.id),
  );
};



