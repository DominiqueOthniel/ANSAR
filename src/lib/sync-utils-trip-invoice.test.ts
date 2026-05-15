import { describe, it, expect } from 'vitest';
import type { Invoice, Trip } from '@/contexts/AppContext';
import {
  sumMontantTTCForTripInvoices,
  getTripRemainingRecetteToInvoice,
  getAvailableTripsForInvoicing,
} from '@/lib/sync-utils';

const trip = (over: Partial<Trip>): Trip =>
  ({
    id: 'trip-1',
    origine: 'A',
    destination: 'B',
    chauffeurId: 'd1',
    dateDepart: '2026-01-01',
    dateArrivee: '',
    recette: 100_000,
    statut: 'planifie',
    ...over,
  }) as Trip;

const inv = (over: Partial<Invoice>): Invoice =>
  ({
    id: 'inv-fixed',
    numero: 'FAC-1',
    trajetId: 'trip-1',
    statut: 'en_attente',
    montantHT: 50_000,
    montantTTC: 50_000,
    dateCreation: '2026-01-02',
    ...over,
  }) as Invoice;

describe('sumMontantTTCForTripInvoices', () => {
  it('somme les TTC des factures du trajet', () => {
    const invoices = [
      inv({ id: 'i1', montantTTC: 30_000 }),
      inv({ id: 'i2', trajetId: 'trip-2', montantTTC: 99 }),
      inv({ id: 'i3', montantTTC: 20_000 }),
    ];
    expect(sumMontantTTCForTripInvoices('trip-1', invoices)).toBe(50_000);
  });
});

describe('getTripRemainingRecetteToInvoice', () => {
  it('retourne recette moins TTC facturé', () => {
    const t = trip({ recette: 100_000 });
    const invoices = [inv({ montantTTC: 40_000 })];
    expect(getTripRemainingRecetteToInvoice(t, invoices)).toBe(60_000);
  });

  it('ne descend pas sous zéro', () => {
    const t = trip({ recette: 10_000 });
    const invoices = [inv({ montantTTC: 50_000 })];
    expect(getTripRemainingRecetteToInvoice(t, invoices)).toBe(0);
  });
});

describe('getAvailableTripsForInvoicing', () => {
  it('inclut un trajet avec recette et reste à facturer', () => {
    const trips = [trip({ recette: 50_000 })];
    const invoices: Invoice[] = [];
    const out = getAvailableTripsForInvoicing(trips, invoices);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('trip-1');
  });

  it('exclut si recette nulle', () => {
    const trips = [trip({ recette: 0 })];
    expect(getAvailableTripsForInvoicing(trips, [])).toHaveLength(0);
  });

  it('exclut si entièrement facturé en TTC', () => {
    const trips = [trip({ recette: 100_000 })];
    const invoices = [inv({ montantTTC: 100_000 })];
    expect(getAvailableTripsForInvoicing(trips, invoices)).toHaveLength(0);
  });

  it('garde le trajet si un reste TTC minime subsiste', () => {
    const trips = [trip({ recette: 100_000 })];
    const invoices = [inv({ montantTTC: 99_999 })];
    expect(getAvailableTripsForInvoicing(trips, invoices)).toHaveLength(1);
  });
});
