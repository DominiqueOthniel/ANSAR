/**
 * Grand livre fournisseurs (style Excel CIMAF) :
 * DATE · NOMS · QLTI · QTES · PX UNI · DEBIT · CREDIT · SOLDE · ATC · IMMAT · OBS
 */

import type {
  Expense,
  Invoice,
  SupplierLoading,
  ThirdParty,
  Truck,
} from '@/contexts/AppContext';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { getArticleSupplierUnitPrice } from '@/lib/article-pricing';
import type { Article } from '@/contexts/AppContext';

export type SupplierLedgerKind = 'achat' | 'paiement' | 'retrait';

export interface SupplierLedgerRow {
  id: string;
  kind: SupplierLedgerKind;
  date: string;
  /** NOMS — client / transporteur lié, sinon fournisseur. */
  noms: string;
  fournisseurId: string;
  fournisseurNom: string;
  qlti: string;
  qtes: number | undefined;
  pxUni: number | undefined;
  debit: number;
  credit: number;
  solde: number;
  atc: string;
  immatriculation: string;
  obs: string;
  /** Id du bon si ligne achat (pour rétractation). */
  loadingId?: string;
  /** Id dépense / facture si paiement. */
  expenseId?: string;
  invoiceId?: string;
  retracted?: boolean;
}

function dateKey(d: string | undefined): string {
  if (!d) return '';
  return d.split('T')[0];
}

function activeAssignments(l: SupplierLoading) {
  return (l.assignments ?? []).filter((a) => a.orderStatus !== 'annulee');
}

function nomsFromLoading(l: SupplierLoading): string {
  const names = [
    ...new Set(
      activeAssignments(l)
        .map((a) => a.clientNom?.trim() || '')
        .filter(Boolean),
    ),
  ];
  if (names.length) return names.join(', ');
  return l.fournisseurNom?.trim() || '';
}

function pxUniForLoading(
  l: SupplierLoading,
  articles: Article[],
): number | undefined {
  if (l.quantite != null && l.quantite > 0 && l.montantBon != null) {
    return Math.round((l.montantBon / l.quantite) * 100) / 100;
  }
  if (l.articleId) {
    const art = articles.find((a) => a.id === l.articleId);
    return getArticleSupplierUnitPrice(art, l.fournisseurId) ?? undefined;
  }
  return undefined;
}

function truckImmat(
  camionId: string | undefined,
  trucks: Truck[],
): string {
  if (!camionId) return '';
  const t = trucks.find((x) => x.id === camionId);
  if (!t) return '';
  return (t.immatriculation || t.nom || '').trim();
}

export function buildSupplierLedgerRows(params: {
  loadings: SupplierLoading[];
  expenses: Expense[];
  invoices: Invoice[];
  articles: Article[];
  trucks: Truck[];
  fournisseurs: ThirdParty[];
  /** Inclure les bons annulés (affichés comme rétractés, débit 0). */
  includeRetracted?: boolean;
  fournisseurId?: string;
  dateFrom?: string;
  dateTo?: string;
}): SupplierLedgerRow[] {
  const {
    loadings,
    expenses,
    invoices,
    articles,
    trucks,
    fournisseurs,
    includeRetracted = false,
    fournisseurId,
    dateFrom,
    dateTo,
  } = params;

  const fournisseurNom = (id: string) =>
    fournisseurs.find((f) => f.id === id)?.nom?.trim() || '';

  type Draft = Omit<SupplierLedgerRow, 'solde'>;
  const drafts: Draft[] = [];

  for (const l of loadings) {
    if (fournisseurId && l.fournisseurId !== fournisseurId) continue;
    const retracted = l.statut === 'annule';
    if (retracted && !includeRetracted) continue;
    const d = dateKey(l.dateChargement);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    const montant = l.montantBon != null && Number.isFinite(l.montantBon) ? l.montantBon : 0;
    drafts.push({
      id: `achat-${l.id}`,
      kind: retracted ? 'retrait' : 'achat',
      date: d,
      noms: nomsFromLoading(l),
      fournisseurId: l.fournisseurId,
      fournisseurNom: l.fournisseurNom?.trim() || fournisseurNom(l.fournisseurId),
      qlti: l.designation?.trim() || '',
      qtes: l.quantite,
      pxUni: pxUniForLoading(l, articles),
      debit: retracted ? 0 : montant,
      credit: 0,
      atc: l.numeroBon?.trim() || '',
      immatriculation: truckImmat(l.camionId, trucks),
      obs: retracted
        ? [l.notes?.trim(), 'Rétracté'].filter(Boolean).join(' · ')
        : l.notes?.trim() || '',
      loadingId: l.id,
      retracted,
    });
  }

  const expenseIdsPaidByInvoice = new Set(
    invoices
      .filter((inv) => inv.expenseId && (inv.montantPaye ?? 0) > 0)
      .map((inv) => inv.expenseId!),
  );

  for (const e of expenses) {
    if (!e.fournisseurId) continue;
    if (fournisseurId && e.fournisseurId !== fournisseurId) continue;
    const d = dateKey(e.date);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    // Évite de doubler un paiement déjà porté par une facture fournisseur.
    if (expenseIdsPaidByInvoice.has(e.id)) continue;
    const credit = Number(e.montant) || 0;
    if (credit <= 0) continue;
    drafts.push({
      id: `paiement-exp-${e.id}`,
      kind: 'paiement',
      date: d,
      noms: '',
      fournisseurId: e.fournisseurId,
      fournisseurNom: fournisseurNom(e.fournisseurId),
      qlti: '',
      qtes: e.quantite,
      pxUni: e.prixUnitaire,
      debit: 0,
      credit,
      atc: '',
      immatriculation: truckImmat(e.camionId, trucks),
      obs: [e.categorie, e.description].filter(Boolean).join(' · '),
      expenseId: e.id,
    });
  }

  for (const inv of invoices) {
    if (!inv.expenseId) continue;
    const paye = Number(inv.montantPaye) || 0;
    if (paye <= 0) continue;
    const exp = expenses.find((e) => e.id === inv.expenseId);
    if (!exp?.fournisseurId) continue;
    if (fournisseurId && exp.fournisseurId !== fournisseurId) continue;
    const d = dateKey(inv.datePaiement || inv.dateCreation);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    drafts.push({
      id: `paiement-inv-${inv.id}`,
      kind: 'paiement',
      date: d,
      noms: '',
      fournisseurId: exp.fournisseurId,
      fournisseurNom: fournisseurNom(exp.fournisseurId),
      qlti: '',
      qtes: undefined,
      pxUni: undefined,
      debit: 0,
      credit: paye,
      atc: inv.numero?.trim() || '',
      immatriculation: truckImmat(exp.camionId, trucks),
      obs: [inv.modePaiement, inv.notes].filter(Boolean).join(' · ') || 'Paiement facture',
      expenseId: exp.id,
      invoiceId: inv.id,
    });
  }

  const sorted = stableSort(drafts, (a, b) => {
    const dd = parseDateMs(a.date) - parseDateMs(b.date);
    if (dd !== 0) return dd;
    // Achats avant paiements le même jour (comme Excel : soldes progressifs).
    if (a.kind !== b.kind) {
      if (a.kind === 'achat' || a.kind === 'retrait') return -1;
      if (b.kind === 'achat' || b.kind === 'retrait') return 1;
    }
    return frCollator.compare(a.id, b.id);
  });

  let solde = 0;
  return sorted.map((row) => {
    solde += row.debit - row.credit;
    return { ...row, solde };
  });
}

export function summarizeSupplierLedger(rows: SupplierLedgerRow[]) {
  const qtes = rows.reduce((s, r) => s + (Number(r.qtes) || 0), 0);
  const debit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const credit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const solde = rows.length ? rows[rows.length - 1].solde : 0;
  return { qtes, debit, credit, solde, n: rows.length };
}
