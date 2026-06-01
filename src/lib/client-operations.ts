const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value?: string | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** Nettoie un identifiant optionnel avant envoi API (évite « xxx must be a UUID »). */
export function sanitizeOptionalUuid(value?: string | null): string | undefined {
  const id = value?.trim();
  return id && isValidUuid(id) ? id : undefined;
}

/** Client enregistré ou comptoir passager (sans UUID client). */
export function buildOrderClientFields(
  isWalkIn: boolean,
  clientId?: string,
  clientLabel?: string,
  walkInInfo?: { telephone?: string; adresse?: string },
): { clientId?: string; clientNom?: string; clientTelephone?: string; clientAdresse?: string } {
  if (isWalkIn) {
    return {
      clientNom: clientLabel?.trim() || 'Client comptoir',
      clientTelephone: walkInInfo?.telephone?.trim() || undefined,
      clientAdresse: walkInInfo?.adresse?.trim() || undefined,
    };
  }
  const id = clientId?.trim();
  if (!id) return {};
  if (!isValidUuid(id)) {
    throw new Error('Identifiant client invalide : rouvrez la fiche client et réessayez.');
  }
  return { clientId: id };
}

export type ClientAccountKind = 'registered' | 'walk_in';

export type ClientIdentityLike = {
  clientId?: string | null;
  clientNom?: string | null;
  clientTelephone?: string | null;
  clientAdresse?: string | null;
};

export function getClientAccountKind(row?: ClientIdentityLike | null): ClientAccountKind {
  return row?.clientId ? 'registered' : 'walk_in';
}

export function formatClientAccountKindFr(kind: ClientAccountKind): string {
  return kind === 'registered' ? 'Client enregistré' : 'Client comptoir';
}

export function getClientAccountKey(row?: ClientIdentityLike | null): string {
  if (row?.clientId) return row.clientId;
  return `comptoir:${row?.clientNom?.trim() || 'Client comptoir'}`;
}

export function formatClientDisplayName(
  row: ClientIdentityLike | undefined | null,
  getRegisteredClientName: (id: string) => string | undefined,
): string {
  if (row?.clientId) return getRegisteredClientName(row.clientId) ?? 'Client enregistré';
  return row?.clientNom?.trim() || 'Client comptoir';
}

export type ClientOrderStatus =
  | 'brouillon'
  | 'confirmee'
  | 'en_preparation'
  | 'partiellement_livree'
  | 'livree'
  | 'annulee';

export type ClientDeliveryStatus = 'planifiee' | 'en_cours' | 'livree' | 'annulee';

export type { ClientDeliveryExitMode } from '@/lib/hub-transit';
export { formatDeliveryExitModeFr } from '@/lib/hub-transit';

const ORDER_STATUS_LABELS: Record<ClientOrderStatus, string> = {
  brouillon: 'Brouillon',
  confirmee: 'Confirmée',
  en_preparation: 'En préparation',
  partiellement_livree: 'Partiellement livrée',
  livree: 'Livrée',
  annulee: 'Annulée',
};

const DELIVERY_STATUS_LABELS: Record<ClientDeliveryStatus, string> = {
  planifiee: 'Planifiée',
  en_cours: 'En cours',
  livree: 'Livrée',
  annulee: 'Annulée',
};

export function formatClientOrderStatusFr(s: ClientOrderStatus): string {
  return ORDER_STATUS_LABELS[s] ?? s;
}

/** Commande clôturée : plus de modification (suppression toujours possible si pas de facture liée). */
export function isClientOrderLocked(statut: ClientOrderStatus): boolean {
  return statut === 'livree' || statut === 'annulee';
}

/** Modifiable tant que la commande n’est pas livrée ni annulée. */
export function isClientOrderEditable(statut: ClientOrderStatus): boolean {
  return !isClientOrderLocked(statut);
}

/** Suppression autorisée quel que soit le statut (blocage côté API si facture liée). */
export function canDeleteClientOrder(_statut: ClientOrderStatus): boolean {
  return true;
}

export function formatClientDeliveryStatusFr(s: ClientDeliveryStatus): string {
  return DELIVERY_STATUS_LABELS[s] ?? s;
}

export const CLIENT_ORDER_STATUS_OPTIONS: ClientOrderStatus[] = [
  'brouillon',
  'confirmee',
  'en_preparation',
  'partiellement_livree',
  'livree',
  'annulee',
];

export const CLIENT_DELIVERY_STATUS_OPTIONS: ClientDeliveryStatus[] = [
  'planifiee',
  'en_cours',
  'livree',
  'annulee',
];
