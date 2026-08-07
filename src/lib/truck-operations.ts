import type {
  ClientDelivery,
  ClientOrder,
  SupplierLoading,
  SupplierLoadingAssignment,
} from '@/contexts/AppContext';

/** Bons de chargement rattachés à un camion. */
export function listLoadingsForTruck(
  loadings: SupplierLoading[],
  truckId: string,
): SupplierLoading[] {
  return loadings.filter((l) => l.camionId === truckId);
}

/** Livraisons assignées à un camion (tracteur). */
export function listDeliveriesForTruck(
  deliveries: ClientDelivery[],
  truckId: string,
): ClientDelivery[] {
  return deliveries.filter((d) => d.tracteurId === truckId);
}

/** Bons sans camion (ou détachables pour réaffectation). */
export function listLoadingsAvailableToLink(
  loadings: SupplierLoading[],
  truckId: string,
): SupplierLoading[] {
  return loadings.filter(
    (l) => l.statut !== 'annule' && (!l.camionId || l.camionId === truckId),
  );
}

/** Livraisons sans camion (hors retrait hub) pour assignation. */
export function listDeliveriesAvailableToAssign(
  deliveries: ClientDelivery[],
  truckId: string,
): ClientDelivery[] {
  return deliveries.filter((d) => {
    if (d.statut === 'annulee') return false;
    if (d.modeSortie === 'retrait_hub') return false;
    return !d.tracteurId || d.tracteurId === truckId;
  });
}

/**
 * Commandes liées au camion via affectations de bons et/ou livraisons.
 */
export function listOrdersLinkedToTruck(
  orders: ClientOrder[],
  loadings: SupplierLoading[],
  deliveries: ClientDelivery[],
  truckId: string,
): ClientOrder[] {
  const orderIds = new Set<string>();

  for (const l of listLoadingsForTruck(loadings, truckId)) {
    for (const a of l.assignments ?? []) {
      if (a.orderStatus === 'annulee') continue;
      if (a.clientOrderId) orderIds.add(a.clientOrderId);
    }
  }

  for (const d of listDeliveriesForTruck(deliveries, truckId)) {
    if (d.clientOrderId) orderIds.add(d.clientOrderId);
  }

  return orders.filter((o) => orderIds.has(o.id));
}

export function summarizeLoadingAssignments(assignments?: SupplierLoadingAssignment[]): string {
  const active = (assignments ?? []).filter((a) => a.orderStatus !== 'annulee');
  if (active.length === 0) return 'Aucune commande';
  return active
    .map((a) => a.orderReference || a.orderDesignation || a.clientNom || a.clientOrderId.slice(0, 8))
    .join(', ');
}

/** Bons liés au tracteur / remorqueuse / camions du chauffeur (hors annulés). */
export function listLoadingsForTripSelection(params: {
  loadings: SupplierLoading[];
  trucks: { id: string; chauffeurId?: string }[];
  tracteurId?: string;
  remorqueuseId?: string;
  chauffeurId?: string;
}): SupplierLoading[] {
  const truckIds = new Set<string>();
  if (params.tracteurId) truckIds.add(params.tracteurId);
  if (params.remorqueuseId) truckIds.add(params.remorqueuseId);
  if (params.chauffeurId) {
    for (const t of params.trucks) {
      if (t.chauffeurId === params.chauffeurId) truckIds.add(t.id);
    }
  }
  if (truckIds.size === 0) return [];
  return params.loadings.filter(
    (l) => l.statut !== 'annule' && !!l.camionId && truckIds.has(l.camionId),
  );
}

export function formatLoadingBonOption(l: SupplierLoading): string {
  const bon = l.numeroBon?.trim() || l.designation;
  const qty =
    l.quantite != null
      ? ` · ${l.quantite}${l.unite ? ` ${l.unite}` : ''}`
      : '';
  const fournisseur = l.fournisseurNom?.trim() ? ` · ${l.fournisseurNom.trim()}` : '';
  return `${bon}${fournisseur}${qty}`;
}
