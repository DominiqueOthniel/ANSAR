import type { HubLoadingStatus, LoadingEntryMode } from '@/lib/hub-transit';
import { computeHubRemainder } from '@/lib/hub-transit';

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

type AssignmentQtyRow = {
  quantiteAffectee?: number;
  orderStatus?: string;
  clientOrderId?: string;
};

/** Affectations actives (commande non annulée). */
export function getActiveLoadingAssignments<T extends AssignmentQtyRow>(
  assignments?: T[],
): T[] {
  return (assignments ?? []).filter((a) => a.orderStatus !== 'annulee');
}

export function sumLoadingAssignedQty(assignments?: AssignmentQtyRow[]): number {
  return getActiveLoadingAssignments(assignments).reduce(
    (sum, a) => sum + (a.quantiteAffectee != null && a.quantiteAffectee > 0 ? a.quantiteAffectee : 0),
    0,
  );
}

export function getLoadingRemainderQty(
  quantite: number | undefined,
  assignments?: AssignmentQtyRow[],
): number | null {
  return computeHubRemainder(quantite, getActiveLoadingAssignments(assignments));
}

export function hasLoadingRemainder(
  quantite: number | undefined,
  assignments?: AssignmentQtyRow[],
): boolean {
  const remainder = getLoadingRemainderQty(quantite, assignments);
  if (remainder == null) return true;
  return remainder > 1e-6;
}

export function isLoadingUnassigned(
  statut: SupplierLoadingStatus,
  quantite: number | undefined,
  assignments?: AssignmentQtyRow[],
): boolean {
  if (statut === 'annule') return false;
  const active = getActiveLoadingAssignments(assignments);
  if (active.length === 0) return true;
  return hasLoadingRemainder(quantite, active);
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
  loadings: { id: string; assignments?: { clientOrderId: string; orderStatus?: string }[] }[],
  orderId: string,
) {
  return loadings.find((l) =>
    l.assignments?.some((a) => a.clientOrderId === orderId && a.orderStatus !== 'annulee'),
  );
}

/** Le bon accepte une nouvelle affectation ou la modification d'une commande déjà liée. */
export function isSupplierLoadingAvailableForOrder(
  loading: { quantite?: number; assignments?: AssignmentQtyRow[] },
  orderId?: string,
): boolean {
  const active = getActiveLoadingAssignments(loading.assignments);
  if (orderId && active.some((a) => a.clientOrderId === orderId)) return true;
  return hasLoadingRemainder(loading.quantite, active);
}

export function validateLoadingAssignmentRows(
  quantite: number | undefined,
  unite: string | undefined,
  rows: { quantiteAffectee?: number }[],
): string | null {
  if (!rows.length) return null;
  if (quantite == null || quantite <= 0) return null;

  let sum = 0;
  for (const row of rows) {
    if (row.quantiteAffectee == null || row.quantiteAffectee <= 0) {
      return 'Indiquez la quantité affectée pour chaque commande sélectionnée.';
    }
    sum += row.quantiteAffectee;
  }
  if (sum > quantite + 1e-6) {
    const unitSuffix = unite ? ` ${unite}` : '';
    return `Total affecté (${sum}${unitSuffix}) dépasse la quantité du bon (${quantite}${unitSuffix}).`;
  }
  return null;
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
  assignments?: AssignmentQtyRow[];
}): string {
  const head = l.numeroBon?.trim() ? `Bon ${l.numeroBon.trim()} — ` : '';
  const qty =
    l.quantite != null && l.quantite > 0
      ? ` · ${l.quantite}${l.unite ? ` ${l.unite}` : ''}`
      : '';
  const remainder = getLoadingRemainderQty(l.quantite, l.assignments);
  const rest =
    remainder != null
      ? ` · reste ${remainder}${l.unite ? ` ${l.unite}` : ''}`
      : '';
  const four = l.fournisseurNom ? ` (${l.fournisseurNom})` : '';
  const hub =
    l.hubArrivee?.trim() || l.modeEntree === 'rail'
      ? ` · ${l.hubArrivee?.trim() || 'CAMRAIL'}`
      : '';
  return `${head}${l.designation}${qty}${rest} — ${formatSupplierLoadingStatusFr(l.statut)}${four}${hub}`;
}
