import type { ClientDelivery, ClientOrder, Invoice, ThirdParty } from '@/contexts/AppContext';
import type { CreditLike } from '@/lib/client-credit-plafond';
import { sumEncoursClientPourPlafond } from '@/lib/client-credit-plafond';

export type ClientSexe = 'homme' | 'femme' | 'autre';
export type ClientSegment = 'particulier' | 'professionnel' | 'gros_compte' | 'institution';

export type ClientSexeFilter = 'all' | ClientSexe | 'unset';
export type ClientSegmentFilter = 'all' | ClientSegment | 'unset';
export type ClientVilleFilter = 'all' | string;
export type ClientAgeFilter = 'all' | 'moins_30' | '30_50' | 'plus_50' | 'unset';
export type ClientEncoursFilter =
  | 'all'
  | 'aucun'
  | 'avec_dette'
  | 'depasse_plafond'
  | 'proche_plafond';
export type ClientActivityFilter = 'all' | 'actif_90j' | 'inactif' | 'sans_commande';
export type ClientLivraisonFilter = 'all' | 'en_cours' | 'sans_livraison';

export const CLIENT_SEXE_OPTIONS: { value: ClientSexe; label: string }[] = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Autre' },
];

export const CLIENT_SEGMENT_OPTIONS: { value: ClientSegment; label: string }[] = [
  { value: 'particulier', label: 'Particulier' },
  { value: 'professionnel', label: 'Professionnel / PME' },
  { value: 'gros_compte', label: 'Gros compte' },
  { value: 'institution', label: 'Institution / chantier' },
];

export const CLIENT_SEXE_FILTER_LABELS: Record<ClientSexeFilter, string> = {
  all: 'Indifférent',
  homme: 'Homme',
  femme: 'Femme',
  autre: 'Autre',
  unset: 'Non renseigné',
};

export const CLIENT_SEGMENT_FILTER_LABELS: Record<ClientSegmentFilter, string> = {
  all: 'Indifférent',
  particulier: 'Particulier',
  professionnel: 'Professionnel / PME',
  gros_compte: 'Gros compte',
  institution: 'Institution / chantier',
  unset: 'Non renseigné',
};

export const CLIENT_AGE_FILTER_LABELS: Record<ClientAgeFilter, string> = {
  all: 'Indifférent',
  moins_30: 'Moins de 30 ans',
  '30_50': '30 – 50 ans',
  plus_50: 'Plus de 50 ans',
  unset: 'Âge non renseigné',
};

export const CLIENT_ENCOURS_FILTER_LABELS: Record<ClientEncoursFilter, string> = {
  all: 'Indifférent',
  aucun: 'Sans dette (encours nul)',
  avec_dette: 'Avec encours (dette)',
  depasse_plafond: 'Plafond dépassé',
  proche_plafond: 'Proche du plafond (≥ 80 %)',
};

export const CLIENT_ACTIVITY_FILTER_LABELS: Record<ClientActivityFilter, string> = {
  all: 'Indifférent',
  actif_90j: 'Actif (commande < 90 j)',
  inactif: 'Inactif (commande > 90 j)',
  sans_commande: 'Jamais commandé',
};

export const CLIENT_LIVRAISON_FILTER_LABELS: Record<ClientLivraisonFilter, string> = {
  all: 'Indifférent',
  en_cours: 'Livraison en cours / planifiée',
  sans_livraison: 'Sans livraison ouverte',
};

export function formatClientSexeFr(sexe?: ClientSexe): string {
  if (!sexe) return '—';
  return CLIENT_SEXE_OPTIONS.find((o) => o.value === sexe)?.label ?? sexe;
}

export function formatClientSegmentFr(segment?: ClientSegment): string {
  if (!segment) return '—';
  return CLIENT_SEGMENT_OPTIONS.find((o) => o.value === segment)?.label ?? segment;
}

export function getClientAgeYears(dateNaissance?: string): number | undefined {
  if (!dateNaissance?.trim()) return undefined;
  const d = new Date(dateNaissance);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function getEncoursClient(
  client: Pick<ThirdParty, 'id' | 'nom' | 'plafondCredit'>,
  invoices: Invoice[],
  credits: CreditLike[],
): number {
  return sumEncoursClientPourPlafond({
    credits,
    client: { id: client.id, nom: client.nom },
    invoices,
  }).total;
}

export type ClientFilterState = {
  sexe: ClientSexeFilter;
  segment: ClientSegmentFilter;
  ville: ClientVilleFilter;
  age: ClientAgeFilter;
  encours: ClientEncoursFilter;
  activity: ClientActivityFilter;
  livraison: ClientLivraisonFilter;
};

export const EMPTY_CLIENT_FILTERS: ClientFilterState = {
  sexe: 'all',
  segment: 'all',
  ville: 'all',
  age: 'all',
  encours: 'all',
  activity: 'all',
  livraison: 'all',
};

export function hasActiveClientFilters(f: ClientFilterState): boolean {
  return (
    f.sexe !== 'all' ||
    f.segment !== 'all' ||
    f.ville !== 'all' ||
    f.age !== 'all' ||
    f.encours !== 'all' ||
    f.activity !== 'all' ||
    f.livraison !== 'all'
  );
}

export function matchesClientAdvancedFilters(
  client: ThirdParty,
  filters: ClientFilterState,
  ctx: {
    invoices: Invoice[];
    credits: CreditLike[];
    clientOrders: ClientOrder[];
    clientDeliveries: ClientDelivery[];
  },
): boolean {
  if (client.type !== 'client') return true;

  if (filters.sexe !== 'all') {
    const s = client.sexe;
    if (filters.sexe === 'unset' && s) return false;
    if (filters.sexe !== 'unset' && s !== filters.sexe) return false;
  }

  if (filters.segment !== 'all') {
    const seg = client.segmentClient;
    if (filters.segment === 'unset' && seg) return false;
    if (filters.segment !== 'unset' && seg !== filters.segment) return false;
  }

  if (filters.ville !== 'all') {
    const v = (client.ville ?? '').trim().toLowerCase();
    if (v !== filters.ville.trim().toLowerCase()) return false;
  }

  if (filters.age !== 'all') {
    const age = getClientAgeYears(client.dateNaissance);
    if (filters.age === 'unset' && age != null) return false;
    if (filters.age === 'moins_30' && (age == null || age >= 30)) return false;
    if (filters.age === '30_50' && (age == null || age < 30 || age > 50)) return false;
    if (filters.age === 'plus_50' && (age == null || age <= 50)) return false;
  }

  if (filters.encours !== 'all') {
    const encours = getEncoursClient(client, ctx.invoices, ctx.credits);
    const plafond = client.plafondCredit;
    if (filters.encours === 'aucun' && encours > 0.01) return false;
    if (filters.encours === 'avec_dette' && encours <= 0.01) return false;
    if (filters.encours === 'depasse_plafond') {
      if (plafond == null || encours <= plafond + 0.01) return false;
    }
    if (filters.encours === 'proche_plafond') {
      if (plafond == null || plafond <= 0) return false;
      if (encours < plafond * 0.8 || encours > plafond + 0.01) return false;
    }
  }

  const orders = ctx.clientOrders.filter((o) => o.clientId === client.id && o.statut !== 'annulee');

  if (filters.activity !== 'all') {
    if (filters.activity === 'sans_commande' && orders.length > 0) return false;
    if (filters.activity === 'actif_90j' || filters.activity === 'inactif') {
      if (orders.length === 0) return false;
      const since = daysAgoIso(90);
      const lastDate = orders.reduce(
        (max, o) => (o.dateCommande > max ? o.dateCommande : max),
        '',
      );
      if (filters.activity === 'actif_90j' && lastDate < since) return false;
      if (filters.activity === 'inactif' && lastDate >= since) return false;
    }
  }

  if (filters.livraison !== 'all') {
    const open = ctx.clientDeliveries.filter(
      (d) =>
        d.clientId === client.id &&
        d.statut !== 'annulee' &&
        d.statut !== 'livree',
    );
    if (filters.livraison === 'en_cours' && open.length === 0) return false;
    if (filters.livraison === 'sans_livraison' && open.length > 0) return false;
  }

  return true;
}

export function collectClientVilles(clients: ThirdParty[]): string[] {
  const set = new Set<string>();
  for (const c of clients) {
    const v = (c.ville ?? '').trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}
