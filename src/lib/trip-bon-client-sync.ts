/**
 * Quand un bon est redistribué à des clients via Trajets,
 * crée / met à jour les commandes + affectations pour impacter le compte client (FAC-CMD / encours).
 *
 * Sans montant > 0, l’API n’émet pas de FAC-CMD → l’encours client ne bouge pas.
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
  /** Montant total du bon (FCFA), utilisé pour déduire un prix unitaire. */
  montantBon?: number;
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

/** Prix unitaire déduit du montant total du bon. */
export function deriveBonPrixUnitaire(bon: Pick<TripBonLike, 'montantBon' | 'quantite'>): number | undefined {
  const q = bon.quantite;
  const m = bon.montantBon;
  if (q == null || q <= 0 || m == null || m <= 0) return undefined;
  return Math.round((m / q) * 100) / 100;
}

/** Montant ligne + prix effectif (saisie client, sinon déduit du bon). */
export function resolveParticipantBilling(
  participant: TripClientParticipant,
  bon: Pick<TripBonLike, 'montantBon' | 'quantite'>,
): { prixUnitaire?: number; montant?: number } {
  const fromLine = participantLineMontant(participant);
  if (fromLine != null && fromLine > 0) {
    return {
      prixUnitaire:
        participant.prixUnitaire != null && participant.prixUnitaire > 0
          ? participant.prixUnitaire
          : undefined,
      montant: fromLine,
    };
  }
  const derivedPu = deriveBonPrixUnitaire(bon);
  const qty = participant.quantite;
  if (derivedPu != null && qty != null && qty > 0) {
    return {
      prixUnitaire: derivedPu,
      montant: Math.round(derivedPu * qty),
    };
  }
  return {};
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

  for (const p of activeParts) {
    const billing = resolveParticipantBilling(p, bon);
    if (billing.montant == null || billing.montant <= 0) {
      throw new Error(
        `Indique un prix unitaire (ou un montant bon) pour « ${p.libelle.trim()} » : sans montant, aucune facture n’est créée et le compte client ne bouge pas.`,
      );
    }
    if (!p.tierId?.trim()) {
      throw new Error(
        `Choisis une fiche client pour « ${p.libelle.trim()} » (pas seulement un libellé) afin d’impacter son compte.`,
      );
    }
  }

  const usedOrderIds = new Set<string>();
  const assignments: SupplierLoadingAssignmentPayload[] = [];
  let created = 0;
  let updated = 0;
  const noteBase = bon.numeroBon?.trim()
    ? `Affectation via trajet — bon ${bon.numeroBon.trim()}`
    : 'Affectation via trajet — bon fournisseur';

  for (const p of activeParts) {
    const billing = resolveParticipantBilling(p, bon);
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
        prixUnitaire: billing.prixUnitaire,
        montant: billing.montant,
        destination: p.lieuLivraison?.trim() || undefined,
        reference: p.sousReferenceBon?.trim() || undefined,
        notes: noteBase,
      });
      updated += 1;
    } else {
      const tierId = p.tierId!.trim();
      const clientFields = buildOrderClientFields(false, tierId, p.libelle.trim());
      const order = await writers.createClientOrder({
        ...clientFields,
        articleId: sanitizeOptionalUuid(bon.articleId),
        designation: bon.designation?.trim() || p.libelle.trim(),
        quantite: p.quantite,
        unite: bon.unite,
        prixUnitaire: billing.prixUnitaire,
        montant: billing.montant,
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
