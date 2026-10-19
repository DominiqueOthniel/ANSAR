/**
 * Quand un bon est redistribué à des clients via Trajets,
 * crée / met à jour les commandes + affectations pour impacter le compte client (FAC-CMD / encours).
 */

import type { ClientOrderPayload, SupplierLoadingAssignmentPayload } from '@/lib/api';
import { buildOrderClientFields, sanitizeOptionalUuid } from '@/lib/client-operations';
import {
  participantLineMontant,
  type TripClientParticipant,
} from '@/lib/trip-client-participants';

export type TripBonLike = {
  id: string;
  numeroBon?: string;
  designation?: string;
  articleId?: string;
  quantite?: number;
  unite?: string;
  assignments?: Array<{
    clientOrderId: string;
    clientId?: string;
    clientNom?: string;
    orderStatus?: string;
    quantiteAffectee?: number;
  }>;
};

export type TripBonClientOrderLike = {
  id: string;
  clientId?: string;
  clientNom?: string;
  statut?: string;
};

export type TripBonClientSyncWriters = {
  createClientOrder: (data: ClientOrderPayload) => Promise<{ id: string }>;
  updateClientOrder: (
    id: string,
    data: Partial<ClientOrderPayload>,
  ) => Promise<unknown>;
  setSupplierLoadingAssignments: (
    loadingId: string,
    assignments: SupplierLoadingAssignmentPayload[],
  ) => Promise<unknown>;
};

function normName(value?: string | null): string {
  return (value ?? '').trim().toLocaleLowerCase('fr');
}

/** Associe une affectation existante du bon à un participant trajet. */
export function matchBonAssignmentToParticipant(
  assignment: NonNullable<TripBonLike['assignments']>[number],
  participant: TripClientParticipant,
): boolean {
  if (assignment.orderStatus === 'annulee') return false;
  const tierId = participant.tierId?.trim();
  if (tierId) return assignment.clientId === tierId;
  return normName(assignment.clientNom) === normName(participant.libelle);
}

export async function syncTripBonToClientAccounts(params: {
  bon: TripBonLike;
  participants: TripClientParticipant[];
  dateCommande: string;
  writers: TripBonClientSyncWriters;
  /** Commandes déjà en mémoire (pour éviter les doublons hors affectations du bon). */
  existingOrders?: TripBonClientOrderLike[];
}): Promise<{ orderIds: string[]; created: number; updated: number }> {
  const { bon, participants, dateCommande, writers } = params;
  const activeParts = participants.filter(
    (p) => p.libelle.trim() && p.quantite != null && p.quantite > 0,
  );
  if (activeParts.length === 0) {
    await writers.setSupplierLoadingAssignments(bon.id, []);
    return { orderIds: [], created: 0, updated: 0 };
  }

  const usedOrderIds = new Set<string>();
  const assignments: SupplierLoadingAssignmentPayload[] = [];
  let created = 0;
  let updated = 0;
  const noteBase = bon.numeroBon?.trim()
    ? `Affectation via trajet — bon ${bon.numeroBon.trim()}`
    : 'Affectation via trajet — bon fournisseur';

  for (const p of activeParts) {
    const montant = participantLineMontant(p);
    const existingAssign = (bon.assignments ?? []).find(
      (a) =>
        !usedOrderIds.has(a.clientOrderId) && matchBonAssignmentToParticipant(a, p),
    );

    let orderId = existingAssign?.clientOrderId;
    if (orderId) {
      usedOrderIds.add(orderId);
      await writers.updateClientOrder(orderId, {
        articleId: sanitizeOptionalUuid(bon.articleId),
        designation: bon.designation?.trim() || p.libelle.trim(),
        quantite: p.quantite,
        unite: bon.unite,
        prixUnitaire:
          p.prixUnitaire != null && p.prixUnitaire > 0 ? p.prixUnitaire : undefined,
        montant: montant != null && montant > 0 ? montant : undefined,
        destination: p.lieuLivraison?.trim() || undefined,
        reference: p.sousReferenceBon?.trim() || undefined,
        notes: noteBase,
      });
      updated += 1;
    } else {
      const tierId = p.tierId?.trim();
      const isWalkIn = !tierId;
      const clientFields = buildOrderClientFields(
        isWalkIn,
        isWalkIn ? undefined : tierId,
        p.libelle.trim(),
      );
      const order = await writers.createClientOrder({
        ...clientFields,
        articleId: sanitizeOptionalUuid(bon.articleId),
        designation: bon.designation?.trim() || p.libelle.trim(),
        quantite: p.quantite,
        unite: bon.unite,
        prixUnitaire:
          p.prixUnitaire != null && p.prixUnitaire > 0 ? p.prixUnitaire : undefined,
        montant: montant != null && montant > 0 ? montant : undefined,
        statut: 'confirmee',
        dateCommande,
        destination: p.lieuLivraison?.trim() || undefined,
        reference: p.sousReferenceBon?.trim() || undefined,
        notes: noteBase,
      });
      orderId = order.id;
      usedOrderIds.add(orderId);
      created += 1;
    }

    assignments.push({
      clientOrderId: orderId,
      quantiteAffectee: p.quantite,
    });
  }

  await writers.setSupplierLoadingAssignments(bon.id, assignments);
  return { orderIds: assignments.map((a) => a.clientOrderId), created, updated };
}
