import { describe, expect, it, vi } from 'vitest';
import {
  matchBonAssignmentToParticipant,
  syncTripBonToClientAccounts,
} from '@/lib/trip-bon-client-sync';
import { newTripClientParticipant } from '@/lib/trip-client-participants';

describe('matchBonAssignmentToParticipant', () => {
  it('associe par tierId', () => {
    const p = newTripClientParticipant({ tierId: 'cli-1', libelle: 'Alpha', quantite: 10 });
    expect(
      matchBonAssignmentToParticipant(
        { clientOrderId: 'o1', clientId: 'cli-1', clientNom: 'Autre' },
        p,
      ),
    ).toBe(true);
  });

  it('associe par nom si pas de tierId', () => {
    const p = newTripClientParticipant({ libelle: 'Beta SARL', quantite: 5 });
    expect(
      matchBonAssignmentToParticipant(
        { clientOrderId: 'o2', clientNom: 'beta sarl' },
        p,
      ),
    ).toBe(true);
  });
});

describe('syncTripBonToClientAccounts', () => {
  it('crée des commandes et affecte le bon', async () => {
    const createClientOrder = vi.fn(async () => ({ id: 'new-order' }));
    const updateClientOrder = vi.fn(async () => ({}));
    const setSupplierLoadingAssignments = vi.fn(async () => ({}));

    const result = await syncTripBonToClientAccounts({
      bon: {
        id: 'bon-1',
        numeroBon: 'B-99',
        designation: 'Ciment',
        quantite: 100,
        unite: 'sacs',
        assignments: [],
      },
      participants: [
        newTripClientParticipant({
          tierId: '11111111-1111-4111-8111-111111111111',
          libelle: 'Client A',
          quantite: 40,
          prixUnitaire: 5000,
        }),
      ],
      dateCommande: '2026-10-19',
      writers: { createClientOrder, updateClientOrder, setSupplierLoadingAssignments },
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(createClientOrder).toHaveBeenCalledOnce();
    expect(setSupplierLoadingAssignments).toHaveBeenCalledWith('bon-1', [
      { clientOrderId: 'new-order', quantiteAffectee: 40 },
    ]);
  });

  it('réutilise la commande déjà affectée au même client', async () => {
    const createClientOrder = vi.fn(async () => ({ id: 'should-not' }));
    const updateClientOrder = vi.fn(async () => ({}));
    const setSupplierLoadingAssignments = vi.fn(async () => ({}));

    const result = await syncTripBonToClientAccounts({
      bon: {
        id: 'bon-1',
        designation: 'Ciment',
        assignments: [
          {
            clientOrderId: 'ord-existing',
            clientId: '11111111-1111-4111-8111-111111111111',
            clientNom: 'Client A',
          },
        ],
      },
      participants: [
        newTripClientParticipant({
          tierId: '11111111-1111-4111-8111-111111111111',
          libelle: 'Client A',
          quantite: 25,
          prixUnitaire: 4000,
        }),
      ],
      dateCommande: '2026-10-19',
      writers: { createClientOrder, updateClientOrder, setSupplierLoadingAssignments },
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(createClientOrder).not.toHaveBeenCalled();
    expect(updateClientOrder).toHaveBeenCalledWith(
      'ord-existing',
      expect.objectContaining({ quantite: 25, montant: 100000 }),
    );
  });
});
