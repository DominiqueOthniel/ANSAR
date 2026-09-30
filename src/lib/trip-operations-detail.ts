/**
 * Détail des opérations d’un trajet (vue œil), colonnes type suivi camion.
 */

import type {
  ClientDelivery,
  Driver,
  Invoice,
  SupplierLoading,
  Trip,
  TripStop,
  Truck,
} from '@/contexts/AppContext';
import { calculatePaidAmountForTrip, sumMontantTTCForTripInvoices } from '@/lib/sync-utils';
import {
  filterActivityNearDate,
  getTripMissionActivity,
  truckMissionLabel,
} from '@/lib/trip-mission-context';
import { labelTripStopType } from '@/lib/trip-stops';

export type TripOperationDetailKind =
  | 'mission'
  | 'arret'
  | 'bon'
  | 'livraison';

export interface TripOperationDetailRow {
  id: string;
  kind: TripOperationDetailKind;
  kindLabel: string;
  date: string;
  quantite?: number;
  qualite?: string;
  destination?: string;
  camionLabel: string;
  atc?: string;
  qtes?: number;
  tonnage?: number;
  telChauffeur?: string;
  prixTrans?: number;
  paiement?: number;
  notes?: string;
}

export interface TripOperationsDetailSummary {
  nbreOperations: number;
  tonnageTotal: number;
  prixTransTotal: number;
  totalPaiement: number;
  resteAPayer: number;
  factureTtc: number;
}

function fmtCamion(truck: Truck | undefined): string {
  return truckMissionLabel(truck);
}

function driverPhone(drivers: Driver[], chauffeurId?: string): string | undefined {
  if (!chauffeurId) return undefined;
  const d = drivers.find((x) => x.id === chauffeurId);
  const tel = d?.telephone?.trim();
  return tel || undefined;
}

function stopDate(trip: Trip, stop: TripStop): string {
  return (trip.dateDepart || '').split('T')[0];
}

/**
 * Construit les lignes d’opérations visibles dans le détail d’un trajet.
 * Mission + arrêts + bons / livraisons liés au camion près de la date.
 */
export function buildTripOperationDetailRows(params: {
  trip: Trip;
  trucks: Truck[];
  drivers: Driver[];
  loadings: SupplierLoading[];
  deliveries: ClientDelivery[];
  invoices?: Invoice[];
  windowDays?: number;
}): TripOperationDetailRow[] {
  const {
    trip,
    trucks,
    drivers,
    loadings,
    deliveries,
    invoices = [],
    windowDays = 21,
  } = params;

  const truck =
    trucks.find((t) => t.id === trip.tracteurId) ||
    trucks.find((t) => t.id === trip.remorqueuseId);
  const camionLabel = fmtCamion(truck);
  const tel = driverPhone(drivers, trip.chauffeurId);
  const paid = calculatePaidAmountForTrip(trip.id, invoices);
  const rows: TripOperationDetailRow[] = [];

  rows.push({
    id: `mission-${trip.id}`,
    kind: 'mission',
    kindLabel: 'Mission',
    date: (trip.dateDepart || '').split('T')[0],
    quantite: trip.quantiteChargee,
    qualite: trip.marchandise?.trim() || undefined,
    destination: trip.destination?.trim() || undefined,
    camionLabel,
    atc: trip.referenceAtc?.trim() || undefined,
    qtes: trip.quantiteChargee,
    telChauffeur: tel,
    prixTrans: trip.recette > 0 ? trip.recette : undefined,
    paiement: paid > 0 ? paid : undefined,
    notes: trip.description?.trim() || undefined,
  });

  const stops = [...(trip.stops ?? [])].sort((a, b) => a.ordre - b.ordre);
  for (const stop of stops) {
    rows.push({
      id: `stop-${stop.id}`,
      kind: 'arret',
      kindLabel: labelTripStopType(stop.type),
      date: stopDate(trip, stop),
      destination: stop.lieu?.trim() || undefined,
      camionLabel,
      telChauffeur: tel,
      notes: [stop.clientRef?.trim(), stop.notes?.trim()].filter(Boolean).join(' · ') || undefined,
    });
  }

  if (trip.supplierLoadingId) {
    const bon = loadings.find((l) => l.id === trip.supplierLoadingId);
    if (bon && bon.statut !== 'annule') {
      rows.push({
        id: `bon-linked-${bon.id}`,
        kind: 'bon',
        kindLabel: 'Bon lié',
        date: (bon.dateChargement || trip.dateDepart || '').split('T')[0],
        quantite: bon.quantite,
        qualite: bon.designation?.trim() || undefined,
        destination: trip.destination?.trim() || undefined,
        camionLabel: bon.camionId
          ? fmtCamion(trucks.find((t) => t.id === bon.camionId)) || camionLabel
          : camionLabel,
        atc: bon.numeroBon?.trim() || trip.referenceAtc?.trim() || undefined,
        qtes: bon.quantite,
        telChauffeur: tel,
        notes: bon.fournisseurNom?.trim() || undefined,
      });
    }
  }

  const truckId = trip.tracteurId || trip.remorqueuseId;
  const activity = filterActivityNearDate(
    getTripMissionActivity(truckId, loadings, deliveries),
    trip.dateDepart,
    windowDays,
  );

  for (const bon of activity.loadings) {
    if (bon.id === trip.supplierLoadingId) continue;
    rows.push({
      id: `bon-${bon.id}`,
      kind: 'bon',
      kindLabel: 'Bon',
      date: (bon.dateChargement || trip.dateDepart || '').split('T')[0],
      quantite: bon.quantite,
      qualite: bon.designation?.trim() || undefined,
      destination: trip.destination?.trim() || undefined,
      camionLabel: bon.camionId
        ? fmtCamion(trucks.find((t) => t.id === bon.camionId)) || camionLabel
        : camionLabel,
      atc: bon.numeroBon?.trim() || undefined,
      qtes: bon.quantite,
      telChauffeur: tel,
      notes: bon.fournisseurNom?.trim() || undefined,
    });
  }

  for (const d of activity.deliveries) {
    rows.push({
      id: `liv-${d.id}`,
      kind: 'livraison',
      kindLabel: 'Livraison',
      date: (d.dateLivraison || d.datePrevue || trip.dateDepart || '').split('T')[0],
      qualite: d.orderDesignation?.trim() || undefined,
      destination: d.lieuLivraison?.trim() || trip.destination?.trim() || undefined,
      camionLabel: d.tracteurId
        ? fmtCamion(trucks.find((t) => t.id === d.tracteurId)) || camionLabel
        : camionLabel,
      atc: trip.referenceAtc?.trim() || undefined,
      prixTrans:
        d.montantTransport != null && d.montantTransport > 0
          ? d.montantTransport
          : undefined,
      telChauffeur: tel,
      notes: d.clientNom?.trim() || undefined,
    });
  }

  return rows;
}

export function summarizeTripOperationDetails(
  trip: Trip,
  rows: TripOperationDetailRow[],
  invoices: Invoice[] = [],
): TripOperationsDetailSummary {
  const tonnageTotal = rows.reduce((s, r) => s + (Number(r.tonnage) || 0), 0);
  const prixTransTotal = trip.recette > 0 ? trip.recette : 0;
  const totalPaiement = calculatePaidAmountForTrip(trip.id, invoices);
  const factureTtc = sumMontantTTCForTripInvoices(trip.id, invoices);
  const resteAPayer =
    factureTtc > 0
      ? Math.max(0, factureTtc - totalPaiement)
      : Math.max(0, prixTransTotal - totalPaiement);

  return {
    nbreOperations: rows.length,
    tonnageTotal,
    prixTransTotal,
    totalPaiement,
    resteAPayer,
    factureTtc,
  };
}
