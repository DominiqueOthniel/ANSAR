import type { ClientDelivery, ClientOrder } from '@/contexts/AppContext';
import type { Invoice } from '@/contexts/AppContext';
import { formatDeliveryExitModeFr } from '@/lib/hub-transit';

export type ClientInvoiceKind = 'order' | 'delivery' | null;

export function getClientInvoiceKind(invoice: Pick<Invoice, 'numero' | 'clientOrderId' | 'clientDeliveryId'>): ClientInvoiceKind {
  if (invoice.clientDeliveryId || invoice.numero.startsWith('FAC-LIV')) return 'delivery';
  if (invoice.clientOrderId || invoice.numero.startsWith('FAC-CMD')) return 'order';
  return null;
}

export function clientInvoiceTypeLabel(kind: ClientInvoiceKind): string {
  if (kind === 'delivery') return 'Transport client';
  if (kind === 'order') return 'Commande client';
  return '';
}

export interface ClientInvoiceDisplayLines {
  title: string;
  lines: string[];
}

export function buildClientInvoiceDisplay(
  invoice: Invoice,
  orders: ClientOrder[],
  deliveries: ClientDelivery[],
  getDriverName: (id?: string) => string,
  getTruckLabel: (id?: string) => string,
  getClientName: (id?: string) => string,
): ClientInvoiceDisplayLines | null {
  const kind = getClientInvoiceKind(invoice);
  if (!kind) return null;

  const clientName =
    getClientName(invoice.clientTierId) || invoice.factureClientLibelle?.trim() || 'Client';

  if (kind === 'order') {
    const order = orders.find((o) => o.id === invoice.clientOrderId);
    return {
      title: invoice.factureClientLibelle || order?.designation || 'Marchandise',
      lines: [
        `Client : ${clientName}`,
        order?.reference ? `Réf. commande : ${order.reference}` : '',
        order?.destination ? `Destination : ${order.destination}` : '',
        order?.statut ? `Statut commande : ${order.statut}` : '',
      ].filter(Boolean),
    };
  }

  const delivery = deliveries.find((d) => d.id === invoice.clientDeliveryId);
  const order = delivery
    ? orders.find((o) => o.id === delivery.clientOrderId)
    : orders.find((o) => o.id === invoice.clientOrderId);

  const lines: string[] = [
    `Client : ${clientName}`,
    `Lieu : ${delivery?.lieuLivraison ?? '—'}`,
  ];

  if (delivery?.modeSortie) {
    lines.push(`Mode : ${formatDeliveryExitModeFr(delivery.modeSortie)}`);
  }
  if (order?.designation) {
    lines.push(`Commande : ${order.designation}`);
  }
  if (delivery?.transportFournisseurNom) {
    lines.push(`Transport fournisseur : ${delivery.transportFournisseurNom}`);
  }
  if (delivery?.chauffeurId) {
    lines.push(`Chauffeur : ${getDriverName(delivery.chauffeurId)}`);
  }
  if (delivery?.tracteurId) {
    lines.push(`Camion : ${getTruckLabel(delivery.tracteurId)}`);
  }

  if (!delivery && invoice.notes) {
    lines.push(invoice.notes);
  }

  return {
    title: invoice.factureClientLibelle || `Transport — ${order?.designation ?? 'livraison'}`,
    lines: lines.filter(Boolean),
  };
}

/** Notes courtes en colonne (évite le pavé transport). */
export function clientInvoiceNotesPreview(invoice: Invoice, kind: ClientInvoiceKind): string | null {
  if (!kind) return invoice.notes ?? null;
  if (kind === 'order') {
    return invoice.notes?.trim() || null;
  }
  return invoice.notes?.includes('Transport —') ? null : invoice.notes?.trim() || null;
}
