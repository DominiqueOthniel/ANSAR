import type { ClientDelivery, ClientOrder } from '@/contexts/AppContext';
import type { Invoice } from '@/contexts/AppContext';
import { formatDeliveryExitModeFr } from '@/lib/hub-transit';

export type ClientInvoiceKind = 'order' | 'delivery' | null;

export function getClientInvoiceKind(
  invoice: Pick<Invoice, 'numero' | 'clientOrderId' | 'clientDeliveryId'>,
): ClientInvoiceKind {
  if (invoice.clientDeliveryId || invoice.numero.startsWith('FAC-LIV')) return 'delivery';
  if (invoice.clientOrderId || invoice.numero.startsWith('FAC-CMD')) return 'order';
  return null;
}

/** Ancienne FAC-LIV masquée si une FAC-CMD existe déjà pour la même commande. */
export function isSupersededClientDeliveryInvoice(
  invoice: Invoice,
  allInvoices: Invoice[],
): boolean {
  if (!invoice.clientDeliveryId && !invoice.numero.startsWith('FAC-LIV')) return false;
  const orderId = invoice.clientOrderId;
  if (!orderId) return false;
  return allInvoices.some(
    (i) =>
      i.id !== invoice.id &&
      i.clientOrderId === orderId &&
      !i.clientDeliveryId &&
      (i.numero.startsWith('FAC-CMD') || i.clientOrderId === orderId),
  );
}

export function clientInvoiceTypeLabel(kind: ClientInvoiceKind): string {
  if (kind === 'delivery') return 'Transport (ancienne facture)';
  if (kind === 'order') return 'Commande client';
  return '';
}

export interface ClientInvoiceDisplayLines {
  title: string;
  lines: string[];
}

function deliveryBillsTransport(d: ClientDelivery): boolean {
  if (d.modeSortie === 'retrait_hub') return false;
  const montant = Number(d.montantTransport ?? 0);
  if (montant <= 0 || d.statut === 'annulee') return false;
  if (d.transportFactureParFournisseur) return true;
  return !!(d.chauffeurId || d.tracteurId);
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

  if (kind === 'order') {
    const order = orders.find((o) => o.id === invoice.clientOrderId);
    const clientName =
      (order?.clientId ? getClientName(order.clientId) : undefined) ||
      order?.clientNom?.trim() ||
      (invoice.clientTierId ? getClientName(invoice.clientTierId) : undefined) ||
      invoice.factureClientLibelle?.trim() ||
      'Client';
    const orderDeliveries = deliveries.filter(
      (d) => d.clientOrderId === order?.id && deliveryBillsTransport(d),
    );
    const marchandise = Number(order?.montant ?? 0);
    const transportTotal = orderDeliveries.reduce(
      (s, d) => s + Number(d.montantTransport ?? 0),
      0,
    );

    const lines: string[] = [
      `Client : ${clientName}`,
      order?.clientTelephone ? `Téléphone : ${order.clientTelephone}` : '',
      order?.clientAdresse ? `Infos : ${order.clientAdresse}` : '',
      order?.reference ? `Réf. commande : ${order.reference}` : '',
      order?.destination ? `Destination : ${order.destination}` : '',
    ];

    if (marchandise > 0) {
      lines.push(`Marchandise : ${marchandise.toLocaleString('fr-FR')} FCFA`);
    }
    for (const d of orderDeliveries) {
      const parts = [
        `Transport — ${d.lieuLivraison} : ${Number(d.montantTransport ?? 0).toLocaleString('fr-FR')} FCFA`,
        formatDeliveryExitModeFr(d.modeSortie),
      ];
      if (d.transportFournisseurNom) parts.push(d.transportFournisseurNom);
      if (d.chauffeurId) parts.push(getDriverName(d.chauffeurId));
      if (d.tracteurId) parts.push(getTruckLabel(d.tracteurId));
      lines.push(parts.filter(Boolean).join(' · '));
    }
    if (transportTotal > 0 && marchandise > 0) {
      lines.push(
        `Total facture : ${Number(invoice.montantTTC).toLocaleString('fr-FR')} FCFA (dont transport ${transportTotal.toLocaleString('fr-FR')} FCFA)`,
      );
    }

    return {
      title:
        order && !order.clientId && order.clientNom?.trim()
          ? `${order.clientNom.trim()} — ${order.designation}`
          : invoice.factureClientLibelle || order?.designation || 'Commande client',
      lines: lines.filter(Boolean),
    };
  }

  const delivery = deliveries.find((d) => d.id === invoice.clientDeliveryId);
  const order = delivery
    ? orders.find((o) => o.id === delivery.clientOrderId)
    : orders.find((o) => o.id === invoice.clientOrderId);
  const clientName =
    (delivery?.clientId ? getClientName(delivery.clientId) : undefined) ||
    delivery?.clientNom?.trim() ||
    (order?.clientId ? getClientName(order.clientId) : undefined) ||
    order?.clientNom?.trim() ||
    (invoice.clientTierId ? getClientName(invoice.clientTierId) : undefined) ||
    invoice.factureClientLibelle?.trim() ||
    'Client';

  const lines: string[] = [
    `Client : ${clientName}`,
    delivery?.clientTelephone || order?.clientTelephone
      ? `Téléphone : ${delivery?.clientTelephone || order?.clientTelephone}`
      : '',
    delivery?.clientAdresse || order?.clientAdresse
      ? `Infos : ${delivery?.clientAdresse || order?.clientAdresse}`
      : '',
    `Lieu : ${delivery?.lieuLivraison ?? '—'}`,
    'Cette facture transport est remplacée par la facture commande (marchandise + transport).',
  ];

  if (delivery?.modeSortie) {
    lines.push(`Mode : ${formatDeliveryExitModeFr(delivery.modeSortie)}`);
  }
  if (order?.designation) {
    lines.push(`Commande : ${order.designation}`);
  }

  return {
    title: invoice.factureClientLibelle || `Transport — ${order?.designation ?? 'livraison'}`,
    lines: lines.filter(Boolean),
  };
}

/** Lignes générées automatiquement sur FAC-CMD (déjà visibles dans Détails). */
function isAutoGeneratedOrderInvoiceNotes(notes: string): boolean {
  const lines = notes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every(
    (line) =>
      /^Commande\s+/i.test(line) ||
      /^Marchandise\s*:/i.test(line) ||
      /^Livraison\s+/i.test(line),
  );
}

/** Notes courtes en colonne — rien si le détail commande suffit. */
export function clientInvoiceNotesPreview(
  invoice: Invoice,
  kind: ClientInvoiceKind,
): string | null {
  if (!kind) return invoice.notes?.trim() || null;
  if (kind === 'order') {
    const notes = invoice.notes?.trim();
    if (!notes || isAutoGeneratedOrderInvoiceNotes(notes)) return null;
    return notes.split('\n')[0] || null;
  }
  return null;
}
