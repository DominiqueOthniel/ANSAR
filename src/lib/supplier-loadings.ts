export type SupplierLoadingStatus =
  | 'brouillon'
  | 'en_attente_affectation'
  | 'partiellement_affecte'
  | 'affecte'
  | 'annule';

const STATUS_LABELS: Record<SupplierLoadingStatus, string> = {
  brouillon: 'Brouillon',
  en_attente_affectation: 'En attente d’affectation',
  partiellement_affecte: 'Partiellement affecté',
  affecte: 'Affecté',
  annule: 'Annulé',
};

export function formatSupplierLoadingStatusFr(s: SupplierLoadingStatus): string {
  return STATUS_LABELS[s] ?? s;
}

export const SUPPLIER_LOADING_STATUS_OPTIONS: SupplierLoadingStatus[] = [
  'brouillon',
  'en_attente_affectation',
  'partiellement_affecte',
  'affecte',
  'annule',
];

export function isLoadingUnassigned(
  statut: SupplierLoadingStatus,
  assignmentCount: number,
): boolean {
  return statut !== 'annule' && assignmentCount === 0;
}

/** Bon utilisable pour rattacher une nouvelle commande client. */
export function canLinkClientOrderToLoading(statut: SupplierLoadingStatus): boolean {
  return statut !== 'annule' && statut !== 'brouillon';
}

export function findSupplierLoadingForOrder(
  loadings: { id: string; assignments?: { clientOrderId: string }[] }[],
  orderId: string,
) {
  return loadings.find((l) => l.assignments?.some((a) => a.clientOrderId === orderId));
}

/** Client déjà lié au bon via une affectation existante. */
export function getLoadingAssignedClientId(loading: {
  assignments?: { clientId?: string }[];
}): string | undefined {
  for (const a of loading.assignments ?? []) {
    if (a.clientId) return a.clientId;
  }
  return undefined;
}

/** Vérifie qu’une commande du client donné peut être rattachée au bon. */
export function canAssignClientOrderToLoading(
  loading: { assignments?: { clientId?: string }[] },
  orderClientId: string,
): boolean {
  const locked = getLoadingAssignedClientId(loading);
  return !locked || locked === orderClientId;
}

export function formatSupplierLoadingBonOption(l: {
  numeroBon?: string;
  designation: string;
  fournisseurNom?: string;
  dateChargement: string;
  quantite?: number;
  unite?: string;
  statut: SupplierLoadingStatus;
}): string {
  const head = l.numeroBon?.trim() ? `Bon ${l.numeroBon.trim()} — ` : '';
  const qty =
    l.quantite != null && l.quantite > 0
      ? ` · ${l.quantite}${l.unite ? ` ${l.unite}` : ''}`
      : '';
  const four = l.fournisseurNom ? ` (${l.fournisseurNom})` : '';
  return `${head}${l.designation}${qty} — ${formatSupplierLoadingStatusFr(l.statut)}${four}`;
}
