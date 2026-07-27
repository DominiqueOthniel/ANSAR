import type { Trip } from '@/contexts/AppContext';

/** Code court lisible pour un trajet (ex. TRJ-A1B2). */
export function formatTripCode(trip: Pick<Trip, 'id'>): string {
  const raw = (trip.id || '').replace(/-/g, '');
  const tail = raw.slice(-4).toUpperCase() || '????';
  return `TRJ-${tail}`;
}
