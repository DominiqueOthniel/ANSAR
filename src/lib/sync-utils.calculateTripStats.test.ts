import { describe, it, expect } from 'vitest';
import { calculateTripStats } from '@/lib/sync-utils';
import type { Expense, Invoice, Trip } from '@/contexts/AppContext';

const baseTrip = (over: Partial<Trip> = {}): Trip => ({
  id: 'trip-1',
  origine: 'A',
  destination: 'B',
  chauffeurId: 'd1',
  dateDepart: '2025-01-01',
  dateArrivee: '2025-01-02',
  recette: 1_000_000,
  statut: 'termine',
  ...over,
});

describe('calculateTripStats — préfinancement et dépenses', () => {
  it('ne compte pas deux fois le préfinancement (champ trajet + dépense Préfinancement)', () => {
    const trip = baseTrip({ prefinancement: 200_000 });
    const expenses: Expense[] = [
      {
        id: 'e-pref',
        tripId: 'trip-1',
        categorie: 'Préfinancement',
        sousCategorie: 'Trajet',
        montant: 200_000,
        date: '2025-01-01',
        description: 'Préfinancement trajet A → B',
      },
      {
        id: 'e-carb',
        tripId: 'trip-1',
        categorie: 'Carburant',
        montant: 50_000,
        date: '2025-01-02',
        description: 'Gasoil',
      },
    ];
    const stats = calculateTripStats('trip-1', expenses, trip);
    expect(stats.prefinancement).toBe(200_000);
    expect(stats.expenses).toBe(50_000);
    expect(stats.solde).toBe(1_000_000 - 200_000 - 50_000);
    expect(stats.expensesCount).toBe(1);
    expect(stats.linkedExpensesCount).toBe(2);
  });

  it('sans champ prefinancement, utilise la dépense Préfinancement (jeux anciens)', () => {
    const trip = baseTrip({ prefinancement: undefined });
    const expenses: Expense[] = [
      {
        id: 'e-pref',
        tripId: 'trip-1',
        categorie: 'Préfinancement',
        montant: 80_000,
        date: '2025-01-01',
        description: 'Préfin',
      },
    ];
    const stats = calculateTripStats('trip-1', expenses, trip);
    expect(stats.prefinancement).toBe(80_000);
    expect(stats.expenses).toBe(0);
    expect(stats.solde).toBe(1_000_000 - 80_000);
    expect(stats.linkedExpensesCount).toBe(1);
  });

  it('recette issue des factures quand invoices est fourni', () => {
    const trip = baseTrip({ prefinancement: 100_000, recette: 999 });
    const expenses: Expense[] = [];
    const invoices: Invoice[] = [
      {
        id: 'inv1',
        numero: 'F-1',
        trajetId: 'trip-1',
        statut: 'payee',
        montantHT: 500_000,
        montantTTC: 500_000,
        montantPaye: 500_000,
        dateCreation: '2025-01-05',
      },
    ];
    const stats = calculateTripStats('trip-1', expenses, trip, invoices);
    expect(stats.recette).toBe(500_000);
    expect(stats.solde).toBe(500_000 - 100_000);
  });

  it('liste de factures sans lien sur ce trajet : recette = montant trajet (pas 0)', () => {
    const trip = baseTrip({ recette: 265_000 });
    const expenses: Expense[] = [];
    const invoices: Invoice[] = [
      {
        id: 'inv-autre',
        numero: 'F-99',
        trajetId: 'autre-trip',
        statut: 'payee',
        montantHT: 1,
        montantTTC: 1,
        montantPaye: 1,
        dateCreation: '2025-01-05',
      },
    ];
    const stats = calculateTripStats('trip-1', expenses, trip, invoices);
    expect(stats.recette).toBe(265_000);
    expect(stats.solde).toBe(265_000);
  });
});
