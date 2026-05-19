import type {
  ClientDelivery,
  ClientOrder,
  Invoice,
  SupplierLoading,
  ThirdParty,
} from '@/contexts/AppContext';
import { sumEncoursClientPourPlafond, type CreditLike } from '@/lib/client-credit-plafond';
import { getClientInitialBalanceMontant } from '@/lib/client-initial-balance';
import {
  formatClientDeliveryStatusFr,
  formatClientOrderStatusFr,
} from '@/lib/client-operations';
import {
  formatClientSegmentFr,
  formatClientSexeFr,
  getClientAgeYears,
} from '@/lib/client-profile';
import {
  exportToExcelWithDetails,
  exportToPrintablePDFWithDetails,
  type ExportDetailBlock,
  type ExportTotal,
} from '@/lib/export-utils';
import { findSupplierLoadingForOrder } from '@/lib/supplier-loadings';
import { frCollator, stableSort } from '@/lib/list-sort';

function formatFcfaPlain(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

function invoiceStatutLabel(s: Invoice['statut']): string {
  return s === 'payee' ? 'Payée' : 'En attente';
}

function invoicesForClient(
  clientId: string,
  invoices: Invoice[],
  orderIds: Set<string>,
  deliveryIds: Set<string>,
): Invoice[] {
  return invoices.filter(
    (inv) =>
      inv.clientTierId === clientId ||
      (inv.clientOrderId != null && orderIds.has(inv.clientOrderId)) ||
      (inv.clientDeliveryId != null && deliveryIds.has(inv.clientDeliveryId)),
  );
}

function cell(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  return String(v);
}

export type ClientsExportContext = {
  clients: ThirdParty[];
  clientOrders: ClientOrder[];
  clientDeliveries: ClientDelivery[];
  invoices: Invoice[];
  supplierLoadings: SupplierLoading[];
  credits: CreditLike[];
  soldeInitialByClientId: Map<string, number>;
  filtersDescription?: string;
  fileNamePrefix?: string;
};

function buildClientDetailBlocks(
  client: ThirdParty,
  ctx: ClientsExportContext,
): ExportDetailBlock[] {
  const orders = stableSort(
    ctx.clientOrders.filter((o) => o.clientId === client.id),
    (a, b) => frCollator.compare(b.dateCommande, a.dateCommande),
  );
  const orderIds = new Set(orders.map((o) => o.id));
  const deliveries = stableSort(
    ctx.clientDeliveries.filter((d) => d.clientId === client.id),
    (a, b) => frCollator.compare(b.datePrevue ?? '', a.datePrevue ?? ''),
  );
  const deliveryIds = new Set(deliveries.map((d) => d.id));
  const clientInvoices = stableSort(
    invoicesForClient(client.id, ctx.invoices, orderIds, deliveryIds),
    (a, b) => frCollator.compare(b.dateCreation, a.dateCreation),
  );

  const encours = sumEncoursClientPourPlafond({
    credits: ctx.credits,
    client: { id: client.id, nom: client.nom },
    invoices: ctx.invoices,
  });
  const soldeInitial = ctx.soldeInitialByClientId.get(client.id) ?? 0;
  const margePlafond =
    client.plafondCredit != null
      ? Math.max(0, Math.round(client.plafondCredit) - encours.total)
      : null;

  const ficheRows: (string | number)[][] = [
    ['Téléphone', cell(client.telephone)],
    ['Email', cell(client.email)],
    ['Adresse', cell(client.adresse)],
    ['Ville / quartier', cell(client.ville?.trim())],
    ['Sexe', formatClientSexeFr(client.sexe)],
    ['Segment', formatClientSegmentFr(client.segmentClient)],
    [
      'Date de naissance',
      client.dateNaissance
        ? getClientAgeYears(client.dateNaissance) != null
          ? `${client.dateNaissance} (${getClientAgeYears(client.dateNaissance)} ans)`
          : client.dateNaissance
        : '—',
    ],
    [
      'Plafond encours',
      client.plafondCredit != null ? formatFcfaPlain(client.plafondCredit) : 'Non défini',
    ],
    ['Dette / solde initial', soldeInitial > 0 ? formatFcfaPlain(soldeInitial) : 'Aucun'],
    ['Encours total (estimé)', formatFcfaPlain(encours.total)],
    ['Dont factures impayées', formatFcfaPlain(encours.factures)],
    ['Dont créances / solde initial', formatFcfaPlain(encours.credits)],
    [
      'Marge sous plafond',
      margePlafond != null ? formatFcfaPlain(margePlafond) : '—',
    ],
    ['Notes internes', cell(client.notes)],
  ];

  const orderRows: (string | number)[][] = orders.length
    ? orders.map((o) => {
        const linked = findSupplierLoadingForOrder(ctx.supplierLoadings, o.id);
        const inv = o.invoiceId
          ? ctx.invoices.find((i) => i.id === o.invoiceId)
          : ctx.invoices.find((i) => i.clientOrderId === o.id);
        return [
          cell(o.reference),
          o.designation,
          cell(o.destination),
          o.dateCommande,
          formatClientOrderStatusFr(o.statut),
          o.quantite != null ? o.quantite : '—',
          o.unite ?? '—',
          o.prixUnitaire != null ? Math.round(o.prixUnitaire) : '—',
          o.montant != null ? Math.round(o.montant) : '—',
          linked
            ? `${linked.numeroBon?.trim() || linked.designation} (${linked.dateChargement})`
            : '—',
          inv ? inv.numero : '—',
          cell(o.notes),
        ];
      })
    : [['—', 'Aucune commande', '', '', '', '', '', '', '', '', '', '']];

  const deliveryRows: (string | number)[][] = deliveries.length
    ? deliveries.map((d) => {
        const order = orders.find((o) => o.id === d.clientOrderId);
        const inv = d.invoiceId
          ? ctx.invoices.find((i) => i.id === d.invoiceId)
          : ctx.invoices.find((i) => i.clientDeliveryId === d.id);
        return [
          order?.reference ?? order?.designation ?? d.orderDesignation ?? '—',
          d.lieuLivraison,
          formatClientDeliveryStatusFr(d.statut),
          cell(d.datePrevue),
          cell(d.dateLivraison),
          d.montantTransport != null ? Math.round(d.montantTransport) : '—',
          d.transportFactureParFournisseur
            ? `Oui${d.transportFournisseurNom ? ` (${d.transportFournisseurNom})` : ''}`
            : 'Non',
          inv ? inv.numero : '—',
          cell(d.notes),
        ];
      })
    : [['—', 'Aucune livraison', '', '', '', '', '', '', '']];

  const invoiceRows: (string | number)[][] = clientInvoices.length
    ? clientInvoices.map((inv) => {
        const reste = Math.max(0, inv.montantTTC - (inv.montantPaye ?? 0));
        return [
          inv.numero,
          invoiceStatutLabel(inv.statut),
          inv.dateCreation,
          cell(inv.datePaiement),
          Math.round(inv.montantHT),
          Math.round(inv.montantTTC),
          Math.round(inv.montantPaye ?? 0),
          Math.round(reste),
          cell(inv.factureClientLibelle),
          cell(inv.notes),
        ];
      })
    : [['—', 'Aucune facture', '', '', '', '', '', '', '', '']];

  return [
    {
      title: 'Fiche & encours',
      columns: ['Champ', 'Valeur'],
      rows: ficheRows,
    },
    {
      title: `Commandes (${orders.length})`,
      columns: [
        'Réf.',
        'Désignation',
        'Destination',
        'Date',
        'Statut',
        'Qté',
        'Unité',
        'P.U. (FCFA)',
        'Montant (FCFA)',
        'Bon chargement',
        'Facture',
        'Notes',
      ],
      rows: orderRows,
    },
    {
      title: `Livraisons (${deliveries.length})`,
      columns: [
        'Commande',
        'Lieu',
        'Statut',
        'Date prévue',
        'Date livrée',
        'Transport (FCFA)',
        'Sous-traité',
        'Facture',
        'Notes',
      ],
      rows: deliveryRows,
    },
    {
      title: `Factures (${clientInvoices.length})`,
      columns: [
        'N°',
        'Statut',
        'Création',
        'Paiement',
        'HT (FCFA)',
        'TTC (FCFA)',
        'Payé (FCFA)',
        'Reste (FCFA)',
        'Libellé',
        'Notes',
      ],
      rows: invoiceRows,
    },
  ];
}

export async function buildSoldeInitialMap(
  clients: ThirdParty[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  await Promise.all(
    clients.map(async (c) => {
      const m = await getClientInitialBalanceMontant(c.id, c.nom);
      map.set(c.id, m);
    }),
  );
  return map;
}

function summaryColumns(ctx: ClientsExportContext) {
  return [
    { header: 'Nom', value: (c: ThirdParty) => c.nom },
    { header: 'Téléphone', value: (c: ThirdParty) => cell(c.telephone) },
    { header: 'Email', value: (c: ThirdParty) => cell(c.email) },
    { header: 'Adresse', value: (c: ThirdParty) => cell(c.adresse) },
    { header: 'Ville', value: (c: ThirdParty) => cell(c.ville?.trim()) },
    { header: 'Segment', value: (c: ThirdParty) => formatClientSegmentFr(c.segmentClient) },
    { header: 'Sexe', value: (c: ThirdParty) => formatClientSexeFr(c.sexe) },
    {
      header: 'Plafond encours (FCFA)',
      value: (c: ThirdParty) =>
        c.plafondCredit != null ? Math.round(c.plafondCredit) : '—',
    },
    {
      header: 'Encours total (FCFA)',
      value: (c: ThirdParty) =>
        Math.round(
          sumEncoursClientPourPlafond({
            credits: ctx.credits,
            client: { id: c.id, nom: c.nom },
            invoices: ctx.invoices,
          }).total,
        ),
    },
    {
      header: 'Solde initial (FCFA)',
      value: (c: ThirdParty) => {
        const m = ctx.soldeInitialByClientId.get(c.id) ?? 0;
        return m > 0 ? m : '—';
      },
    },
    {
      header: 'Nb commandes',
      value: (c: ThirdParty) =>
        ctx.clientOrders.filter((o) => o.clientId === c.id).length,
    },
    {
      header: 'Nb livraisons',
      value: (c: ThirdParty) =>
        ctx.clientDeliveries.filter((d) => d.clientId === c.id).length,
    },
  ];
}

export function exportClientsDetailedExcel(ctx: ClientsExportContext): void {
  const prefix = ctx.fileNamePrefix ?? 'clients';
  exportToExcelWithDetails({
    title: 'Liste des clients — détail complet',
    fileName: `${prefix}_${new Date().toISOString().split('T')[0]}.xlsx`,
    sheetName: 'Clients',
    filtersDescription: ctx.filtersDescription,
    columns: summaryColumns(ctx),
    rows: ctx.clients,
    buildDetailBlocks: (c) => buildClientDetailBlocks(c, ctx),
    getDetailHeading: (c) => c.nom,
  });
}

export function exportClientsDetailedPDF(
  ctx: ClientsExportContext,
  totals: ExportTotal[],
): void {
  const prefix = ctx.fileNamePrefix ?? 'clients';
  exportToPrintablePDFWithDetails({
    title: 'Liste des clients — détail complet',
    fileName: `${prefix}_${new Date().toISOString().split('T')[0]}.pdf`,
    filtersDescription: ctx.filtersDescription,
    headerColor: '#059669',
    headerTextColor: '#ffffff',
    evenRowColor: '#ecfdf5',
    oddRowColor: '#ffffff',
    accentColor: '#059669',
    totals,
    columns: summaryColumns(ctx),
    rows: ctx.clients,
    buildDetailBlocks: (c) => buildClientDetailBlocks(c, ctx),
    getDetailHeading: (c) => c.nom,
  });
}
