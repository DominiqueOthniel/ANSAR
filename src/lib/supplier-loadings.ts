import type { HubLoadingStatus, LoadingEntryMode } from '@/lib/hub-transit';

export type SupplierLoadingStatus =
  | 'brouillon'
  | HubLoadingStatus
  | 'en_attente_affectation'
  | 'partiellement_affecte'
  | 'affecte'
  | 'annule';

const STATUS_LABELS: Record<SupplierLoadingStatus, string> = {
  brouillon: 'Brouillon',
  en_transit: 'En transit vers hub',
  au_hub: 'Au hub (CAMRAIL)',
  en_dispatch: 'Dispatch en cours',
  solde: 'Soldé / tout dispatché',
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
  'en_transit',
  'au_hub',
  'en_dispatch',
  'solde',
  'en_attente_affectation',
  'partiellement_affecte',
  'affecte',
  'annule',
];

export const HUB_LOADING_STATUS_OPTIONS: HubLoadingStatus[] = [
  'en_transit',
  'au_hub',
  'en_dispatch',
  'solde',
];

export function isLoadingUnassigned(
  statut: SupplierLoadingStatus,
  assignmentCount: number,
): boolean {
  return statut !== 'annule' && assignmentCount === 0;
}

export function isLoadingAtHub(statut: SupplierLoadingStatus): boolean {
  return statut === 'au_hub' || statut === 'en_dispatch' || statut === 'en_transit';
}

/** Bon utilisable pour rattacher une nouvelle commande client. */
export function canLinkClientOrderToLoading(statut: SupplierLoadingStatus): boolean {
  return (
    statut !== 'annule' &&
    statut !== 'brouillon' &&
    statut !== 'en_transit' &&
    statut !== 'solde'
  );
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
  modeEntree?: LoadingEntryMode;
  hubArrivee?: string;
}): string {
  const head = l.numeroBon?.trim() ? `Bon ${l.numeroBon.trim()} — ` : '';
  const qty =
    l.quantite != null && l.quantite > 0
      ? ` · ${l.quantite}${l.unite ? ` ${l.unite}` : ''}`
      : '';
  const four = l.fournisseurNom ? ` (${l.fournisseurNom})` : '';
  const hub =
    l.hubArrivee?.trim() || l.modeEntree === 'rail'
      ? ` · ${l.hubArrivee?.trim() || 'CAMRAIL'}`
      : '';
  return `${head}${l.designation}${qty} — ${formatSupplierLoadingStatusFr(l.statut)}${four}${hub}`;
}
