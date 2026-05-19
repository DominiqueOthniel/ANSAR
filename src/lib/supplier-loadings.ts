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
