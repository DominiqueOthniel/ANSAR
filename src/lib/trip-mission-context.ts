import type {
  ClientDelivery,
  SupplierLoading,
  Truck,
} from '@/contexts/AppContext';
import {
  listDeliveriesForTruck,
  listLoadingsForTruck,
} from '@/lib/truck-operations';
import { formatClientDeliveryStatusFr } from '@/lib/client-operations';
import { formatSupplierLoadingStatusFr } from '@/lib/supplier-loadings';
import { parseDateMs } from '@/lib/list-sort';

/** Libellé camion pour mission : nom court (TF3) puis plaque. */
export function truckMissionLabel(truck: Truck | undefined | null): string {
  if (!truck) return '—';
  const short = truck.nom?.trim();
  if (short) return short;
  return truck.immatriculation || '—';
}

export type TripMissionActivity = {
  loadings: SupplierLoading[];
  deliveries: ClientDelivery[];
  loadingsCount: number;
  deliveriesCount: number;
  summaryLine: string;
};

/**
 * Activité client / marchandises déjà sur le même camion
 * (bons + livraisons). Complète la mission Trajet sans la remplacer.
 */
export function getTripMissionActivity(
  truckId: string | undefined,
  loadings: SupplierLoading[],
  deliveries: ClientDelivery[],
): TripMissionActivity {
  if (!truckId) {
    return {
      loadings: [],
      deliveries: [],
      loadingsCount: 0,
      deliveriesCount: 0,
      summaryLine: 'Aucun camion',
    };
  }
  const linkedLoadings = listLoadingsForTruck(loadings, truckId).filter(
    (l) => l.statut !== 'annule',
  );
  const linkedDeliveries = listDeliveriesForTruck(deliveries, truckId).filter(
    (d) => d.statut !== 'annulee',
  );

  const parts: string[] = [];
  if (linkedLoadings.length) parts.push(`${linkedLoadings.length} bon(s)`);
  if (linkedDeliveries.length) parts.push(`${linkedDeliveries.length} livraison(s)`);

  return {
    loadings: linkedLoadings,
    deliveries: linkedDeliveries,
    loadingsCount: linkedLoadings.length,
    deliveriesCount: linkedDeliveries.length,
    summaryLine: parts.length ? parts.join(' · ') : 'Pas d’activité client liée',
  };
}

/** Bons / livraisons proches de la date de départ (fenêtre ± jours). */
export function filterActivityNearDate(
  activity: TripMissionActivity,
  dateDepart: string | undefined,
  windowDays = 14,
): TripMissionActivity {
  if (!dateDepart?.trim()) return activity;
  const center = parseDateMs(dateDepart);
  if (!center) return activity;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const loadings = activity.loadings.filter((l) => {
    const t = parseDateMs(l.dateLivraison || l.dateChargement);
    return t > 0 && Math.abs(t - center) <= windowMs;
  });
  const deliveries = activity.deliveries.filter((d) => {
    const t = parseDateMs(d.datePrevue || d.dateLivraison);
    return t > 0 && Math.abs(t - center) <= windowMs;
  });

  const parts: string[] = [];
  if (loadings.length) parts.push(`${loadings.length} bon(s)`);
  if (deliveries.length) parts.push(`${deliveries.length} livraison(s)`);

  return {
    loadings,
    deliveries,
    loadingsCount: loadings.length,
    deliveriesCount: deliveries.length,
    summaryLine: parts.length
      ? `${parts.join(' · ')} (±${windowDays} j)`
      : activity.summaryLine,
  };
}

export function formatLoadingActivityLine(l: SupplierLoading): string {
  const clients = [
    ...new Set(
      (l.assignments ?? [])
        .map((a) => a.clientNom?.trim())
        .filter(Boolean) as string[],
    ),
  ].join(', ');
  const bon = l.numeroBon?.trim() || l.designation;
  return `${bon} · ${l.fournisseurNom ?? 'Fournisseur'} · ${formatSupplierLoadingStatusFr(l.statut)}${
    clients ? ` · ${clients}` : ''
  }`;
}

export function formatDeliveryActivityLine(d: ClientDelivery): string {
  return `${d.clientNom?.trim() || 'Client'} · ${d.lieuLivraison || '—'} · ${formatClientDeliveryStatusFr(d.statut)}`;
}
