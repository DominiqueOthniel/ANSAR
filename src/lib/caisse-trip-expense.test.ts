import { describe, expect, it, vi } from 'vitest';
import {
  caisseReferenceForExpense,
  linkedExpenseIdFromCaisse,
  removeLinkedExpenseForCaisseSortie,
  syncExpenseForTripCaisseSortie,
} from '@/lib/caisse-trip-expense';

describe('caisse-trip-expense', () => {
  it('construit et lit la référence dépense', () => {
    expect(caisseReferenceForExpense('exp-1')).toBe('depense:exp-1');
    expect(linkedExpenseIdFromCaisse('depense:exp-1')).toBe('exp-1');
    expect(linkedExpenseIdFromCaisse(undefined)).toBeUndefined();
  });

  it('crée une dépense avec tripId quand aucune n’existe', async () => {
    const createExpense = vi.fn(async () => ({ id: 'new-exp' }));
    const updateExpense = vi.fn();
    const deleteExpense = vi.fn();

    const id = await syncExpenseForTripCaisseSortie(
      { createExpense, updateExpense, deleteExpense },
      {
        tripId: 'trip-1',
        montant: 50000,
        date: '2026-09-15',
        description: 'Gasoil',
        categorie: 'Carburant',
        camionId: 'truck-1',
        chauffeurId: 'drv-1',
      },
    );

    expect(id).toBe('new-exp');
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-1',
        montant: 50000,
        categorie: 'Carburant',
        camionId: 'truck-1',
      }),
    );
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it('met à jour la dépense existante', async () => {
    const createExpense = vi.fn();
    const updateExpense = vi.fn(async () => ({}));
    const deleteExpense = vi.fn();

    const id = await syncExpenseForTripCaisseSortie(
      { createExpense, updateExpense, deleteExpense },
      {
        tripId: 'trip-1',
        existingExpenseId: 'exp-9',
        montant: 12000,
        date: '2026-09-16',
        description: 'Péage',
        categorie: 'Péage',
      },
    );

    expect(id).toBe('exp-9');
    expect(updateExpense).toHaveBeenCalled();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it('supprime la dépense liée via référence', async () => {
    const deleteExpense = vi.fn(async () => undefined);
    await removeLinkedExpenseForCaisseSortie(
      { deleteExpense },
      'depense:exp-42',
    );
    expect(deleteExpense).toHaveBeenCalledWith('exp-42');
  });
});
