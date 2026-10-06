/**
 * Récap des achats de bons = mouvements de Chargements (supplier_loadings).
 * Source unique : création des bons. Aucune dépense / facture / client.
 */

import type {
  Article,
  SupplierLoading,
  ThirdParty,
  Truck,
} from '@/contexts/AppContext';
import { getArticleSupplierUnitPrice } from '@/lib/article-pricing';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { formatSupplierLoadingStatusFr } from '@/lib/supplier-loadings';
import { formatLoadingEntryModeFr } from '@/lib/hub-transit';

export interface SupplierLoadingRecapRow {
  id: string;
  loadingId: string;
  date: string;
  fournisseurId: string;
  fournisseurNom: string;
  qlti: string;
  qtes: number | undefined;
  unite: string;
  pxUni: number | undefined;
  /** Valeur du bon (montant achat). */
  montant: number;
  numeroBon: string;
  immatriculation: string;
  modeEntree: string;
  statut: string;
  statutLabel: string;
  obs: string;
  retracted: boolean;
}

function dateKey(d: string | undefined): string {
  if (!d) return '';
  return d.split('T')[0];
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

function truckImmat(camionId: string | undefined, trucks: Truck[]): string {
  if (!camionId) return '';
  const t = trucks.find((x) => x.id === camionId);
  if (!t) return '';
  return (t.immatriculation || t.nom || '').trim();
}

/** Une ligne = un bon créé dans Chargements. */
export function buildSupplierLoadingRecapRows(params: {
  loadings: SupplierLoading[];
  articles: Article[];
  trucks: Truck[];
  fournisseurs: ThirdParty[];
  includeRetracted?: boolean;
  fournisseurId?: string;
  dateFrom?: string;
  dateTo?: string;
}): SupplierLoadingRecapRow[] {
  const {
    loadings,
    articles,
    trucks,
    fournisseurs,
    includeRetracted = false,
    fournisseurId,
    dateFrom,
    dateTo,
  } = params;

  const resolveNom = (id: string, fallback?: string) =>
    fallback?.trim() || fournisseurs.find((f) => f.id === id)?.nom?.trim() || '';

  const rows: SupplierLoadingRecapRow[] = [];

  for (const l of loadings) {
    if (fournisseurId && l.fournisseurId !== fournisseurId) continue;
    const retracted = l.statut === 'annule';
    if (retracted && !includeRetracted) continue;
    const d = dateKey(l.dateChargement);
    if (dateFrom && d < dateFrom) continue;
    if (dateTo && d > dateTo) continue;
    const montant =
      l.montantBon != null && Number.isFinite(l.montantBon) ? l.montantBon : 0;

    rows.push({
      id: l.id,
      loadingId: l.id,
      date: d,
      fournisseurId: l.fournisseurId,
      fournisseurNom: resolveNom(l.fournisseurId, l.fournisseurNom),
      qlti: l.designation?.trim() || '',
      qtes: l.quantite,
      unite: l.unite?.trim() || '',
      pxUni: pxUniForLoading(l, articles),
      montant: retracted ? 0 : montant,
      numeroBon: l.numeroBon?.trim() || '',
      immatriculation: truckImmat(l.camionId, trucks),
      modeEntree: formatLoadingEntryModeFr(l.modeEntree),
      statut: l.statut,
      statutLabel: formatSupplierLoadingStatusFr(l.statut),
      obs: retracted
        ? [l.notes?.trim(), 'Rétracté / annulé'].filter(Boolean).join(' · ')
        : l.notes?.trim() || '',
      retracted,
    });
  }

  return stableSort(rows, (a, b) => {
    const dd = parseDateMs(b.date) - parseDateMs(a.date);
    if (dd !== 0) return dd;
    return frCollator.compare(a.numeroBon || a.qlti, b.numeroBon || b.qlti);
  });
}

export function summarizeSupplierLoadingRecap(rows: SupplierLoadingRecapRow[]) {
  const actifs = rows.filter((r) => !r.retracted);
  const qtes = actifs.reduce((s, r) => s + (Number(r.qtes) || 0), 0);
  const montant = actifs.reduce((s, r) => s + (Number(r.montant) || 0), 0);
  return { n: actifs.length, qtes, montant };
}

/** @deprecated Alias — ancien grand livre (dépenses/factures). */
export type SupplierLedgerRow = SupplierLoadingRecapRow & {
  kind?: string;
  debit?: number;
  credit?: number;
  solde?: number;
  atc?: string;
  loadingId?: string;
};

export function buildSupplierLedgerRows(params: {
  loadings: SupplierLoading[];
  expenses?: unknown[];
  invoices?: unknown[];
  articles: Article[];
  trucks: Truck[];
  fournisseurs: ThirdParty[];
  includeRetracted?: boolean;
  fournisseurId?: string;
  dateFrom?: string;
  dateTo?: string;
}): SupplierLoadingRecapRow[] {
  return buildSupplierLoadingRecapRows(params);
}

export function summarizeSupplierLedger(rows: SupplierLoadingRecapRow[]) {
  const s = summarizeSupplierLoadingRecap(rows);
  return { qtes: s.qtes, debit: s.montant, credit: 0, solde: s.montant, n: s.n };
}
