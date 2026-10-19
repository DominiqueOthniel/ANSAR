import { describe, expect, it, vi } from 'vitest';
import {
  deriveBonPrixUnitaire,
  matchBonAssignmentToParticipant,
  resolveParticipantBilling,
  syncTripBonToClientAccounts,
} from '@/lib/trip-bon-client-sync';
import { newTripClientParticipant } from '@/lib/trip-client-participants';

describe('deriveBonPrixUnitaire / resolveParticipantBilling', () => {
  it('déduit le PU depuis montantBon', () => {
    expect(deriveBonPrixUnitaire({ montantBon: 100000, quantite: 20 })).toBe(5000);
  });

  it('utilise le PU déduit si la ligne n’a pas de prix', () => {
    const p = newTripClientParticipant({ libelle: 'A', quantite: 10 });
    expect(resolveParticipantBilling(p, { montantBon: 50000, quantite: 10 })).toEqual({
      prixUnitaire: 5000,
      montant: 50000,
    });
  });
});

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
});

describe('syncTripBonToClientAccounts', () => {
  it('refuse sans montant facturable', async () => {
    await expect(
      syncTripBonToClientAccounts({
        bon: { id: 'bon-1', designation: 'Ciment', assignments: [] },
        participants: [
          newTripClientParticipant({
            tierId: '11111111-1111-4111-8111-111111111111',
            libelle: 'Client A',
            quantite: 40,
          }),
        ],
        dateCommande: '2026-10-19',
        writers: {
          createClientOrder: vi.fn(),
          updateClientOrder: vi.fn(),
          setSupplierLoadingAssignments: vi.fn(),
        },
      }),
    ).rejects.toThrow(/prix unitaire|montant/i);
  });

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
