export type ClientOrderStatus =
  | 'brouillon'
  | 'confirmee'
  | 'en_preparation'
  | 'partiellement_livree'
  | 'livree'
  | 'annulee';

export type ClientDeliveryStatus = 'planifiee' | 'en_cours' | 'livree' | 'annulee';

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

/** Commande clôturée : plus de modification ni suppression. */
export function isClientOrderLocked(statut: ClientOrderStatus): boolean {
  return statut === 'livree' || statut === 'annulee';
}

/** Modifiable tant que la commande n’est pas livrée ni annulée. */
export function isClientOrderEditable(statut: ClientOrderStatus): boolean {
  return !isClientOrderLocked(statut);
}

export function canDeleteClientOrder(statut: ClientOrderStatus): boolean {
  return isClientOrderEditable(statut);
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
