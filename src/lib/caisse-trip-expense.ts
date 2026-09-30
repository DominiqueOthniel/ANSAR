/**
 * Lie une sortie caisse à une dépense (expenses.tripId) pour impacter le solde trajet.
 */

import {
  expenseIdFromCaisseReference,
  isCaisseDepenseTransaction,
} from '@/lib/caisse-local';
import type { ExpensePayload } from '@/lib/api';

export type TripExpenseWriter = {
  createExpense: (data: ExpensePayload) => Promise<{ id: string }>;
  updateExpense: (id: string, data: Partial<ExpensePayload>) => Promise<unknown>;
  deleteExpense: (id: string) => Promise<void>;
};

export function caisseReferenceForExpense(expenseId: string): string {
  return `depense:${expenseId}`;
}

export function linkedExpenseIdFromCaisse(
  reference: string | undefined | null,
): string | undefined {
  if (!isCaisseDepenseTransaction({ reference: reference || undefined })) {
    return undefined;
  }
  return expenseIdFromCaisseReference(reference);
}

/**
 * Crée ou met à jour la dépense liée à une sortie caisse rattachée à un trajet.
 * Retourne l’id dépense (pour `reference` caisse `depense:{id}`).
 */
export async function syncExpenseForTripCaisseSortie(
  writers: TripExpenseWriter,
  params: {
    tripId: string;
    existingExpenseId?: string;
    montant: number;
    date: string;
    description: string;
    categorie: string;
    camionId?: string;
    chauffeurId?: string;
  },
): Promise<string> {
  const payload: ExpensePayload = {
    tripId: params.tripId,
    camionId: params.camionId || null,
    chauffeurId: params.chauffeurId || undefined,
    categorie: params.categorie.trim() || 'Autre',
    sousCategorie: 'Trajet',
    montant: params.montant,
    date: params.date.includes('T') ? params.date.split('T')[0] : params.date,
    description: params.description.trim() || `Sortie caisse trajet`,
  };

  if (params.existingExpenseId) {
    await writers.updateExpense(params.existingExpenseId, payload);
    return params.existingExpenseId;
  }

  const created = await writers.createExpense(payload);
  return created.id;
}

/** Supprime la dépense liée si la sortie caisse était rattachée via `depense:`. */
export async function removeLinkedExpenseForCaisseSortie(
  writers: Pick<TripExpenseWriter, 'deleteExpense'>,
  reference: string | undefined | null,
): Promise<void> {
  const expenseId = linkedExpenseIdFromCaisse(reference);
  if (!expenseId) return;
  try {
    await writers.deleteExpense(expenseId);
  } catch (err) {
    console.error('removeLinkedExpenseForCaisseSortie', err);
  }
}
