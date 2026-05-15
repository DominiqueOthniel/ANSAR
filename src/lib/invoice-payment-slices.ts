import type { TripClientParticipant } from './trip-client-participants';

/** Ligne de ventilation d’un encaissement sur facture (plusieurs payeurs possibles sur une même facture trajet). */
export interface InvoicePaymentEncaissement {
  montant: number;
  /** Fiche tiers type client, si connue. */
  clientTierId?: string;
  /** Libellé affiché (participant trajet sans fiche, ou dénormalisation). */
  payeurLibelle?: string;
}

export function normalizeInvoicePaymentSlices(raw: unknown): InvoicePaymentEncaissement[] {
  if (!Array.isArray(raw)) return [];
  const out: InvoicePaymentEncaissement[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const montant =
      typeof o.montant === 'number' ? o.montant : typeof o.montant === 'string' ? parseFloat(o.montant) : NaN;
    if (!Number.isFinite(montant) || montant <= 0) continue;
    const clientTierId =
      o.clientTierId != null && String(o.clientTierId).trim() !== ''
        ? String(o.clientTierId)
        : undefined;
    const payeurLibelle =
      o.payeurLibelle != null && String(o.payeurLibelle).trim() !== ''
        ? String(o.payeurLibelle).trim()
        : undefined;
    out.push({ montant, clientTierId, payeurLibelle });
  }
  return out;
}

export function sumInvoicePaymentSlices(slices: InvoicePaymentEncaissement[]): number {
  return slices.reduce((s, x) => s + x.montant, 0);
}

/** Plusieurs clients sur le trajet : proposer le payeur pour chaque encaissement. */
export function tripHasMultipleInvoicePayers(
  trip: { clientParticipants?: { id: string; libelle?: string }[] } | undefined,
): boolean {
  const n = (trip?.clientParticipants ?? []).filter((p) => (p.libelle ?? '').trim()).length;
  return n >= 2;
}

function resolveTripInvoicePayerForSlice(
  trip: { clientParticipants?: TripClientParticipant[]; payeurParticipantId?: string } | undefined,
  paymentPayerParticipantId: string | undefined,
  invoice: { clientTierId?: string; factureClientLibelle?: string },
  thirdParties: { id: string; nom: string }[],
): { clientTierId?: string; payeurLibelle: string } {
  const parts = (trip?.clientParticipants ?? []).filter((p) => p.libelle.trim());
  if (parts.length >= 2) {
    const pid = paymentPayerParticipantId?.trim();
    const chosen =
      (pid ? parts.find((x) => x.id === pid) : undefined) ??
      (trip?.payeurParticipantId
        ? parts.find((x) => x.id === trip.payeurParticipantId)
        : undefined) ??
      parts[0];
    const nomFiche = chosen.tierId ? thirdParties.find((t) => t.id === chosen.tierId)?.nom : undefined;
    return {
      clientTierId: chosen.tierId,
      payeurLibelle:
        (nomFiche || chosen.libelle || '').trim() ||
        invoice.factureClientLibelle?.trim() ||
        'Payeur',
    };
  }
  if (parts.length === 1) {
    const p0 = parts[0];
    const nomFiche = p0.tierId ? thirdParties.find((t) => t.id === p0.tierId)?.nom : undefined;
    return {
      clientTierId: p0.tierId ?? invoice.clientTierId,
      payeurLibelle:
        (nomFiche || p0.libelle || '').trim() ||
        invoice.factureClientLibelle?.trim() ||
        (invoice.clientTierId ? thirdParties.find((t) => t.id === invoice.clientTierId)?.nom : '') ||
        'Client',
    };
  }
  const cid = invoice.clientTierId;
  return {
    clientTierId: cid,
    payeurLibelle:
      invoice.factureClientLibelle?.trim() ||
      (cid ? thirdParties.find((t) => t.id === cid)?.nom : '') ||
      'Encaissement',
  };
}

/**
 * Ajoute une ligne de ventilation pour un nouvel encaissement.
 * Rétro-remplit une ligne « non ventilée » si `montantPaye` > 0 sans historique de lignes.
 */
export function mergeTripInvoicePaymentSlices(args: {
  invoice: {
    montantPaye?: number;
    clientTierId?: string;
    factureClientLibelle?: string;
    paiementsEncaissements?: InvoicePaymentEncaissement[] | unknown;
  };
  trip: { clientParticipants?: TripClientParticipant[]; payeurParticipantId?: string } | undefined;
  additionalAmount: number;
  /** Obligatoire si ≥ 2 participants sur le trajet : id du participant payeur. */
  payerParticipantId?: string;
  thirdParties: { id: string; nom: string }[];
}): { paiementsEncaissements: InvoicePaymentEncaissement[]; payerDescription: string } {
  const { invoice, trip, additionalAmount, payerParticipantId, thirdParties } = args;
  const dejaPaye = Number(invoice.montantPaye ?? 0);
  let rows = normalizeInvoicePaymentSlices(invoice.paiementsEncaissements);

  if (additionalAmount > 0.01 && rows.length === 0 && dejaPaye > 0.01) {
    const lib =
      invoice.factureClientLibelle?.trim() ||
      (invoice.clientTierId ? thirdParties.find((t) => t.id === invoice.clientTierId)?.nom : '') ||
      'Encaissement';
    rows = [{ montant: dejaPaye, clientTierId: invoice.clientTierId, payeurLibelle: lib }];
  }

  const payer = resolveTripInvoicePayerForSlice(trip, payerParticipantId, invoice, thirdParties);

  if (additionalAmount > 0.01) {
    rows = [
      ...rows,
      {
        montant: additionalAmount,
        clientTierId: payer.clientTierId,
        payeurLibelle: payer.payeurLibelle,
      },
    ];
  }

  return { paiementsEncaissements: rows, payerDescription: payer.payeurLibelle };
}
