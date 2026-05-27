/** Flux hub / CAMRAIL — entrée fournisseur et sortie vers le client. */

export type LoadingEntryMode =
  | 'bon_simple'
  | 'camion_ansar'
  | 'rail'
  | 'rendu_fournisseur'
  /** Anciennes valeurs conservées pour les bons déjà enregistrés. */
  | 'camion'
  | 'autre';

export type ClientDeliveryExitMode =
  | 'retrait_hub'
  | 'livraison_agent'
  | 'livraison_directe';

export type HubLoadingStatus =
  | 'en_transit'
  | 'au_hub'
  | 'en_dispatch'
  | 'solde';

/** Gares / dépôts CAMRAIL au Cameroun (Chemins de fer du Cameroun). */
export const HUB_PRESETS = [
  'CAMRAIL Douala',
  'CAMRAIL Yaoundé',
  'CAMRAIL Ngaoundéré',
  'CAMRAIL Edéa',
  'Autre hub',
] as const;

export const LOADING_ENTRY_MODE_OPTIONS: { value: LoadingEntryMode; label: string }[] = [
  { value: 'bon_simple', label: 'Bon simple (client se débrouille)' },
  { value: 'camion_ansar', label: 'Camion direct ANSAR' },
  { value: 'rail', label: 'CAMRAIL' },
  { value: 'rendu_fournisseur', label: 'Rendu fournisseur' },
];

export const DELIVERY_EXIT_MODE_OPTIONS: {
  value: ClientDeliveryExitMode;
  label: string;
  hint: string;
}[] = [
  {
    value: 'retrait_hub',
    label: 'Retrait au hub (client vient chercher)',
    hint: 'Pas de chauffeur : le client récupère à CAMRAIL.',
  },
  {
    value: 'livraison_agent',
    label: 'Livraison agent (depuis le hub)',
    hint: 'Dispatch depuis le hub vers l’adresse client.',
  },
  {
    value: 'livraison_directe',
    label: 'Livraison directe (hors hub)',
    hint: 'Camion direct fournisseur → client.',
  },
];

const ENTRY_LABELS: Record<LoadingEntryMode, string> = {
  bon_simple: 'Bon simple',
  camion_ansar: 'Camion direct ANSAR',
  rail: 'CAMRAIL',
  rendu_fournisseur: 'Rendu fournisseur',
  camion: 'Camion direct ANSAR',
  autre: 'Bon simple',
};

const EXIT_LABELS: Record<ClientDeliveryExitMode, string> = {
  retrait_hub: 'Retrait hub',
  livraison_agent: 'Livraison agent',
  livraison_directe: 'Direct',
};

export function formatLoadingEntryModeFr(m: LoadingEntryMode | string | undefined): string {
  if (!m) return '—';
  return ENTRY_LABELS[m as LoadingEntryMode] ?? m;
}

export function formatDeliveryExitModeFr(m: ClientDeliveryExitMode | string | undefined): string {
  if (!m) return '—';
  return EXIT_LABELS[m as ClientDeliveryExitMode] ?? m;
}

export function isHubLoadingStatus(s: string): s is HubLoadingStatus {
  return s === 'en_transit' || s === 'au_hub' || s === 'en_dispatch' || s === 'solde';
}

export function defaultHubForEntryMode(mode: LoadingEntryMode): string {
  return mode === 'rail' ? HUB_PRESETS[0] : '';
}

export function suggestedDeliveryExitFromHub(hubArrivee?: string): ClientDeliveryExitMode {
  return hubArrivee?.trim() ? 'retrait_hub' : 'livraison_directe';
}

export function deliveryLieuForExitMode(
  mode: ClientDeliveryExitMode,
  hubArrivee: string,
  clientDestination: string,
): string {
  if (mode === 'retrait_hub') return hubArrivee.trim() || HUB_PRESETS[0];
  return clientDestination.trim();
}

/** Quantité encore au hub (bon − affectations). */
export function computeHubRemainder(
  quantite: number | undefined,
  assignments: { quantiteAffectee?: number }[] | undefined,
): number | null {
  if (quantite == null || quantite <= 0) return null;
  const assigned = (assignments ?? []).reduce(
    (s, a) => s + (a.quantiteAffectee != null && a.quantiteAffectee > 0 ? a.quantiteAffectee : 0),
    0,
  );
  return Math.max(0, quantite - assigned);
}
