import { describe, expect, it } from 'vitest';
import type {
  ClientDelivery,
  ClientOrder,
  Invoice,
  SupplierLoading,
  Trip,
  Truck,
} from '@/contexts/AppContext';
import { getInvoiceCamionLabel, getOrderCamionLabel } from '@/lib/client-export';

const trucks = [
  {
    id: 't-m1',
    immatriculation: 'LT-001-AA',
    nom: 'M1',
    type: 'tracteur',
    modele: 'FH',
    statut: 'actif',
    dateMiseEnCirculation: '2020-01-01',
    flotte: 'ansar',
  },
  {
    id: 't-tf',
    immatriculation: 'LT-002-BB',
    nom: 'TF',
    type: 'remorqueuse',
    modele: 'R',
    statut: 'actif',
    dateMiseEnCirculation: '2019-01-01',
    flotte: 'ansar',
  },
] as Truck[];

const baseOrder: ClientOrder = {
  id: 'ord-1',
  clientId: 'cli-1',
  designation: 'Ciment',
  quantite: 30,
  montant: 100000,
  statut: 'confirmee',
  dateCommande: '2026-03-01',
};

function tripStub(partial: Partial<Trip> & Pick<Trip, 'id'>): Trip {
  return {
    chauffeurId: 'ch-1',
    origine: 'Yaoundé',
    destination: 'Douala',
    dateDepart: '2026-03-01',
    dateArrivee: '2026-03-02',
    recette: 0,
    statut: 'termine',
    ...partial,
  };
}

describe('getOrderCamionLabel', () => {
  it('prend le camion depuis la livraison', () => {
    const deliveries: ClientDelivery[] = [
      {
        id: 'del-1',
        clientOrderId: 'ord-1',
        lieuLivraison: 'Douala',
        statut: 'livree',
        tracteurId: 't-m1',
      },
    ];
    expect(
      getOrderCamionLabel(baseOrder, deliveries, {
        trucks,
        supplierLoadings: [],
        invoices: [],
        trips: [],
      }),
    ).toBe('M1');
  });

  it('prend le camion depuis le bon de chargement affecté', () => {
    const loadings: SupplierLoading[] = [
      {
        id: 'load-1',
        fournisseurId: 'f-1',
        designation: 'Ciment',
        dateChargement: '2026-03-01',
        statut: 'en_dispatch',
        camionId: 't-tf',
        assignments: [{ id: 'a-1', loadingId: 'load-1', clientOrderId: 'ord-1' }],
      },
    ];
    expect(
      getOrderCamionLabel(baseOrder, [], {
        trucks,
        supplierLoadings: loadings,
        invoices: [],
        trips: [],
      }),
    ).toBe('TF');
  });

  it('prend le camion depuis le trajet lié au bon', () => {
    const loadings: SupplierLoading[] = [
      {
        id: 'load-2',
        fournisseurId: 'f-1',
        designation: 'Ciment',
        dateChargement: '2026-03-01',
        statut: 'en_dispatch',
        assignments: [{ id: 'a-2', loadingId: 'load-2', clientOrderId: 'ord-1' }],
      },
    ];
    const trips = [tripStub({ id: 'trip-1', tracteurId: 't-m1', supplierLoadingId: 'load-2' })];
    expect(
      getOrderCamionLabel(baseOrder, [], {
        trucks,
        supplierLoadings: loadings,
        invoices: [],
        trips,
      }),
    ).toBe('M1');
  });

  it('prend le camion depuis la facture trajet de la commande', () => {
    const invoices: Invoice[] = [
      {
        id: 'inv-1',
        numero: 'FAC-1',
        clientOrderId: 'ord-1',
        trajetId: 'trip-9',
        statut: 'en_attente',
        montantHT: 100000,
        montantTTC: 100000,
        dateCreation: '2026-03-01',
      },
    ];
    const trips = [tripStub({ id: 'trip-9', remorqueuseId: 't-tf' })];
    expect(
      getOrderCamionLabel(baseOrder, [], {
        trucks,
        supplierLoadings: [],
        invoices,
        trips,
      }),
    ).toBe('TF');
  });
});

describe('getInvoiceCamionLabel', () => {
  it('affiche le camion du trajet pour une facture hors commande', () => {
    const inv: Invoice = {
      id: 'inv-2',
      numero: 'FAC-T',
      trajetId: 'trip-2',
      clientTierId: 'cli-1',
      statut: 'en_attente',
      montantHT: 50000,
      montantTTC: 50000,
      dateCreation: '2026-03-02',
    };
    const trips = [tripStub({ id: 'trip-2', tracteurId: 't-m1' })];
    expect(
      getInvoiceCamionLabel(inv, {
        trucks,
        clientDeliveries: [],
        trips,
      }),
    ).toBe('M1');
  });
});
