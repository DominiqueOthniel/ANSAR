/** Clients liés au trajet (parts, facturation, règlement). Aligné backend `TripClientParticipantPersisted`. */
export interface TripClientParticipant {
  id: string;
  tierId?: string;
  libelle: string;
  montantAttribue?: number;
}

export function newTripClientParticipant(
  partial?: Partial<Omit<TripClientParticipant, 'id'>>,
): TripClientParticipant {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    libelle: partial?.libelle ?? '',
    tierId: partial?.tierId,
    montantAttribue: partial?.montantAttribue,
  };
}

export function remapParticipantsForDuplicate(
  parts: TripClientParticipant[] | undefined,
  oldPayeurId?: string | null,
): { clientParticipants: TripClientParticipant[]; payeurParticipantId: string } {
  const list = parts ?? [];
  if (list.length === 0) return { clientParticipants: [], payeurParticipantId: '' };
  const idMap = new Map<string, string>();
  const clientParticipants = list.map((p) => {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    idMap.set(p.id, id);
    return { ...p, id };
  });
  let payeurParticipantId = '';
  if (oldPayeurId && idMap.has(oldPayeurId)) {
    payeurParticipantId = idMap.get(oldPayeurId)!;
  } else if (clientParticipants.length === 1) {
    payeurParticipantId = clientParticipants[0].id;
  }
  return { clientParticipants, payeurParticipantId };
}

export function getInvoiceClientDefaultsFromTrip(trip: {
  client?: string;
  clientParticipants?: TripClientParticipant[];
  payeurParticipantId?: string;
}): { clientTierId: string; factureClientLibelle: string } {
  const parts = trip.clientParticipants ?? [];
  const payeurId = trip.payeurParticipantId;
  const payeur = payeurId ? parts.find((p) => p.id === payeurId) : parts[0];
  if (payeur) {
    return {
      clientTierId: payeur.tierId ?? '',
      factureClientLibelle: (payeur.libelle || trip.client || '').trim(),
    };
  }
  return { clientTierId: '', factureClientLibelle: (trip.client ?? '').trim() };
}

export function formatTripClientsSummary(trip: {
  client?: string;
  clientParticipants?: TripClientParticipant[];
}): string {
  const parts = trip.clientParticipants ?? [];
  if (parts.length === 0) return trip.client?.trim() || '—';
  const names = parts.map((p) => p.libelle.trim()).filter(Boolean);
  if (names.length === 0) return trip.client?.trim() || '—';
  return names.join(', ');
}
