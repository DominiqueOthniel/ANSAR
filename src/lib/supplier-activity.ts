import type { Article, ClientDelivery, Expense, SupplierLoading, ThirdParty } from '@/contexts/AppContext';
import { formatSupplierLoadingStatusFr, isLoadingUnassigned } from '@/lib/supplier-loadings';

export type SupplierEtat = 'alerte' | 'actif' | 'calme';

export type SupplierActivityKind =
  | 'chargement'
  | 'depense'
  | 'transport_client'
  | 'tarif_article';

export interface SupplierActivityItem {
  id: string;
  kind: SupplierActivityKind;
  date: string;
  label: string;
  detail?: string;
  amount?: number;
  statut?: string;
  linkTo?: string;
}

export interface SupplierSummary {
  fournisseurId: string;
  nom: string;
  etat: SupplierEtat;
  etatLabel: string;
  chargementsTotal: number;
  chargementsEnAttente: number;
  chargementsPartiels: number;
  depensesRecentes: number;
  montantDepensesRecentes: number;
  transportsDirectClient: number;
  tarifsArticles: number;
  derniereActivite?: string;
  activites: SupplierActivityItem[];
}

const ACTIVITY_WINDOW_DAYS = 90;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isRecent(date: string, sinceIso: string): boolean {
  return date >= sinceIso;
}

export function formatSupplierEtatFr(etat: SupplierEtat): string {
  switch (etat) {
    case 'alerte':
      return 'À traiter';
    case 'actif':
      return 'Actif';
    case 'calme':
      return 'Calme';
  }
}

export function supplierEtatBadgeVariant(
  etat: SupplierEtat,
): 'destructive' | 'default' | 'secondary' {
  if (etat === 'alerte') return 'destructive';
  if (etat === 'actif') return 'default';
  return 'secondary';
}

const KIND_LABELS: Record<SupplierActivityKind, string> = {
  chargement: 'Bon de chargement',
  depense: 'Dépense',
  transport_client: 'Transport sous-traité',
  tarif_article: 'Tarif article',
};

export function formatSupplierActivityKindFr(k: SupplierActivityKind): string {
  return KIND_LABELS[k] ?? k;
}

export function buildSupplierSummaries(params: {
  fournisseurs: ThirdParty[];
  supplierLoadings: SupplierLoading[];
  expenses: Expense[];
  clientDeliveries: ClientDelivery[];
  articles: Article[];
}): SupplierSummary[] {
  const since = daysAgoIso(ACTIVITY_WINDOW_DAYS);
  const { fournisseurs, supplierLoadings, expenses, clientDeliveries, articles } = params;

  return fournisseurs.map((f) => {
    const loadings = supplierLoadings.filter(
      (l) => l.fournisseurId === f.id && l.statut !== 'annule',
    );
    const chargementsEnAttente = loadings.filter((l) =>
      isLoadingUnassigned(l.statut, l.assignments?.length ?? 0),
    ).length;
    const chargementsPartiels = loadings.filter(
      (l) => l.statut === 'partiellement_affecte',
    ).length;

    const depensesF = expenses.filter(
      (e) => e.fournisseurId === f.id && isRecent(e.date, since),
    );
    const montantDepensesRecentes = depensesF.reduce((s, e) => s + e.montant, 0);

    const transportsDirect = clientDeliveries.filter(
      (d) =>
        d.transportFactureParFournisseur &&
        d.transportFournisseurId === f.id &&
        d.statut !== 'annulee',
    );

    let tarifsArticles = 0;
    for (const art of articles) {
      tarifsArticles += (art.supplierPrices ?? []).filter(
        (p) => p.fournisseurId === f.id,
      ).length;
    }

    const activites: SupplierActivityItem[] = [];

    for (const l of loadings) {
      activites.push({
        id: `loading-${l.id}`,
        kind: 'chargement',
        date: l.dateChargement,
        label: l.designation,
        detail: l.numeroBon ? `Bon ${l.numeroBon}` : undefined,
        statut: formatSupplierLoadingStatusFr(l.statut),
        linkTo: '/chargements',
      });
    }
    for (const e of depensesF) {
      activites.push({
        id: `expense-${e.id}`,
        kind: 'depense',
        date: e.date,
        label: e.description || e.categorie,
        detail: e.categorie,
        amount: e.montant,
        linkTo: '/depenses',
      });
    }
    for (const d of transportsDirect) {
      activites.push({
        id: `transport-${d.id}`,
        kind: 'transport_client',
        date: d.datePrevue ?? d.dateLivraison ?? '',
        label: d.lieuLivraison,
        detail: d.orderDesignation ?? 'Livraison client',
        linkTo: `/clients`,
      });
    }
    for (const art of articles) {
      for (const p of art.supplierPrices ?? []) {
        if (p.fournisseurId !== f.id) continue;
        activites.push({
          id: `price-${p.id}`,
          kind: 'tarif_article',
          date: '',
          label: art.libelle,
          detail: `${p.prixUnitaire.toLocaleString('fr-FR')} FCFA / ${art.unite}`,
          amount: p.prixUnitaire,
          linkTo: '/articles',
        });
      }
    }

    activites.sort((a, b) => {
      const da = a.date || '0000-00-00';
      const db = b.date || '0000-00-00';
      return db.localeCompare(da);
    });

    const dated = activites.filter((a) => a.date);
    const derniereActivite = dated[0]?.date;

    let etat: SupplierEtat = 'calme';
    if (chargementsEnAttente > 0 || chargementsPartiels > 0) {
      etat = 'alerte';
    } else if (
      loadings.length > 0 ||
      depensesF.length > 0 ||
      transportsDirect.length > 0
    ) {
      etat = 'actif';
    }

    return {
      fournisseurId: f.id,
      nom: f.nom,
      etat,
      etatLabel: formatSupplierEtatFr(etat),
      chargementsTotal: loadings.length,
      chargementsEnAttente,
      chargementsPartiels,
      depensesRecentes: depensesF.length,
      montantDepensesRecentes,
      transportsDirectClient: transportsDirect.length,
      tarifsArticles,
      derniereActivite,
      activites: activites.slice(0, 40),
    };
  });
}

export function buildGlobalSupplierFeed(
  summaries: SupplierSummary[],
  limit = 30,
): (SupplierActivityItem & { fournisseurNom: string; fournisseurId: string })[] {
  const all: (SupplierActivityItem & { fournisseurNom: string; fournisseurId: string })[] =
    [];
  for (const s of summaries) {
    for (const a of s.activites) {
      if (!a.date) continue;
      all.push({ ...a, fournisseurNom: s.nom, fournisseurId: s.fournisseurId });
    }
  }
  all.sort((a, b) => b.date.localeCompare(a.date));
  return all.slice(0, limit);
}
