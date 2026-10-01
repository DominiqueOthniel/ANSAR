import { describe, expect, it } from 'vitest';
import type { Trip } from '@/contexts/AppContext';
import {
  buildTripOperationDetailRows,
  summarizeTripOperationDetails,
} from '@/lib/trip-operations-detail';

const baseTrip: Trip = {
  id: 'trip-1',
  tracteurId: 'truck-1',
  origine: 'Douala',
  destination: 'Garoua Boulai',
  chauffeurId: 'drv-1',
  dateDepart: '2026-09-05',
  dateArrivee: '2026-09-06',
  recette: 784000,
  marchandise: 'Falcon',
  referenceAtc: '2048426807',
  quantiteChargee: 560,
  statut: 'en_cours',
  stops: [
    {
      id: 's1',
      ordre: 0,
      type: 'chargement',
      lieu: 'Cimenterie',
      statut: 'fait',
    },
    {
      id: 's2',
      ordre: 1,
      type: 'livraison',
      lieu: 'Garoua Boulai',
      clientRef: 'Client A',
      statut: 'prevu',
    },
  ],
};

describe('buildTripOperationDetailRows', () => {
  it('expose la mission et les arrêts du trajet', () => {
    const rows = buildTripOperationDetailRows({
      trip: baseTrip,
      trucks: [
        {
          id: 'truck-1',
          immatriculation: 'LTTR128BD',
          nom: 'M1',
          type: 'tracteur',
          statut: 'actif',
        } as any,
      ],
      drivers: [
        {
          id: 'drv-1',
          nom: 'Doe',
          prenom: 'John',
          telephone: '690456268',
        } as any,
      ],
      loadings: [],
      deliveries: [],
      invoices: [],
    });

    expect(rows[0]?.kind).toBe('mission');
    expect(rows[0]?.quantite).toBe(560);
    expect(rows[0]?.qualite).toBe('Falcon');
    expect(rows[0]?.camionLabel).toBe('M1');
    expect(rows[0]?.telChauffeur).toBe('690456268');
    expect(rows[0]?.prixTrans).toBe(784000);
    expect(rows.filter((r) => r.kind === 'arret')).toHaveLength(2);
  });

  it('calcule le résumé paiement / reste', () => {
    const rows = buildTripOperationDetailRows({
      trip: baseTrip,
      trucks: [],
      drivers: [],
      loadings: [],
      deliveries: [],
    });
    const summary = summarizeTripOperationDetails(baseTrip, rows, [
      {
        id: 'inv-1',
        trajetId: 'trip-1',
        montantTTC: 784000,
        montantPaye: 600000,
      } as any,
    ]);
    expect(summary.nbreOperations).toBeGreaterThan(0);
    expect(summary.prixTransTotal).toBe(784000);
    expect(summary.totalPaiement).toBe(600000);
    expect(summary.resteAPayer).toBe(184000);
  });
});
