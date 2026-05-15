import type { Trip, TripStop, TripStopStatut, TripStopType } from '@/contexts/AppContext';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newTripStop(
  ordre: number,
  type: TripStopType,
  lieu: string,
  partial?: Partial<TripStop>,
): TripStop {
  return {
    id: partial?.id ?? randomId(),
    ordre,
    type,
    lieu,
    statut: partial?.statut ?? 'prevu',
    clientRef: partial?.clientRef,
    lat: partial?.lat,
    lng: partial?.lng,
    notes: partial?.notes,
  };
}

/** Si aucun arrêt saisi : dérive chargement + livraison depuis le résumé trajet. */
export function buildStopsForPersist(
  explicit: TripStop[],
  origine: string,
  destination: string,
  origineLat?: number,
  origineLng?: number,
  destinationLat?: number,
  destinationLng?: number,
): TripStop[] {
  const filtered = explicit
    .map((s, i) => ({ ...s, ordre: i }))
    .filter((s) => s.lieu.trim());
  if (filtered.length > 0) {
    return filtered.map((s, i) => ({ ...s, ordre: i }));
  }
  return [
    newTripStop(0, 'chargement', origine.trim(), {
      lat: origineLat,
      lng: origineLng,
      statut: 'prevu',
    }),
    newTripStop(1, 'livraison', destination.trim() || 'Livraison (à préciser)', {
      lat: destinationLat,
      lng: destinationLng,
      statut: 'prevu',
    }),
  ];
}

export function stopsSummaryLine(trip: Trip): string {
  const rows = trip.stops?.filter((s) => s.lieu.trim()) ?? [];
  if (rows.length === 0) return '';
  const label = `${rows.length} arrêt${rows.length > 1 ? 's' : ''}`;
  const prefix = (t: TripStopType) =>
    t === 'chargement' ? 'charg. ' : t === 'livraison' ? 'livr. ' : '';
  const chain = rows.map((s) => `${prefix(s.type)}${s.lieu.trim()}`).join(' → ');
  return `${label} : ${chain}`;
}

export function initialStopsDraftFromTrip(trip: Trip): TripStop[] {
  const existing = trip.stops?.filter((s) => s.lieu.trim()) ?? [];
  if (existing.length > 0) {
    return existing.map((s, i) => ({ ...s, ordre: i }));
  }
  return [
    newTripStop(0, 'chargement', trip.origine, {
      lat: trip.origineLat,
      lng: trip.origineLng,
      statut: 'prevu',
    }),
    newTripStop(1, 'livraison', (trip.destination ?? '').trim() || 'Livraison (à préciser)', {
      lat: trip.destinationLat,
      lng: trip.destinationLng,
      statut: 'prevu',
    }),
  ];
}

const TYPE_LABELS: Record<TripStopType, string> = {
  chargement: 'Chargement (fournisseur)',
  livraison: 'Livraison (client)',
  autre: 'Autre arrêt',
};

const STATUT_LABELS: Record<TripStopStatut, string> = {
  prevu: 'Prévu',
  fait: 'Fait',
  annule: 'Annulé',
};

export function labelTripStopType(t: TripStopType): string {
  return TYPE_LABELS[t] ?? t;
}

export function labelTripStopStatut(s: TripStopStatut): string {
  return STATUT_LABELS[s] ?? s;
}
