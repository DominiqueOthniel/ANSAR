/** Libellés canoniques enregistrés sur `invoice.modePaiement` / caisse. */
export const PAYMENT_MODE = {
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  MTN: 'MTN Mobile Money',
  ORANGE: 'Orange Money',
  VIREMENT_DIRECT: 'Versement direct',
  VIREMENT_INDIRECT: 'Versement indirect',
} as const;

export type PaymentModeValue = (typeof PAYMENT_MODE)[keyof typeof PAYMENT_MODE];

/** Famille UI (sélection en 2 étapes). */
export type PaymentModeFamily = 'especes' | 'cheque' | 'electronique' | 'virement';

/** Où le règlement impacte la trésorerie Ansar (espèces / mobile). */
export type PaymentTreasuryDestination = 'caisse' | 'aucun';

/**
 * Banques pour traçabilité (versement direct Ansar, ou banque de l’entreprise en indirect).
 * Liste fixe : aucun compte à créer dans le module Banque.
 */
export const ANSAR_BANQUES = ['Afriland', 'CBC', 'UBA', 'CCA'] as const;
export type AnsarBanque = (typeof ANSAR_BANQUES)[number];

const BANQUE_SEP = ' · ';

const LEGACY_TO_CANONICAL: Record<string, PaymentModeValue> = {
  Virement: PAYMENT_MODE.VIREMENT_DIRECT,
  'Virement bancaire': PAYMENT_MODE.VIREMENT_DIRECT,
  'Virement direct': PAYMENT_MODE.VIREMENT_DIRECT,
  'Virement indirect': PAYMENT_MODE.VIREMENT_INDIRECT,
  'Versement bancaire': PAYMENT_MODE.VIREMENT_DIRECT,
  'Mobile Money': PAYMENT_MODE.MTN,
  'Mobile money': PAYMENT_MODE.MTN,
};

const CANONICAL_BASES = Object.values(PAYMENT_MODE);

function startsWithBase(raw: string, base: string): boolean {
  return raw === base || raw.startsWith(`${base}${BANQUE_SEP}`);
}

/** Mode sans suffixes entreprise / banque. */
export function paymentModeBase(mode: string | undefined | null): string | undefined {
  if (!mode?.trim()) return undefined;
  const raw = mode.trim();

  for (const base of CANONICAL_BASES) {
    if (startsWithBase(raw, base)) return base;
  }
  if (startsWithBase(raw, 'Virement indirect')) return PAYMENT_MODE.VIREMENT_INDIRECT;
  if (startsWithBase(raw, 'Virement direct')) return PAYMENT_MODE.VIREMENT_DIRECT;
  if (startsWithBase(raw, 'Virement')) return PAYMENT_MODE.VIREMENT_DIRECT;

  return LEGACY_TO_CANONICAL[raw] ?? raw;
}

export function normalizePaymentMode(mode: string | undefined | null): string | undefined {
  const base = paymentModeBase(mode);
  if (!base) return undefined;
  return LEGACY_TO_CANONICAL[base] ?? base;
}

/** Extrait la banque Ansar d’un versement direct « Versement direct · Afriland ». */
export function parseAnsarBanque(mode: string | undefined | null): AnsarBanque | undefined {
  const base = paymentModeBase(mode);
  if (base !== PAYMENT_MODE.VIREMENT_DIRECT) return undefined;
  const raw = mode?.trim() ?? '';
  if (!startsWithBase(raw, base) && !startsWithBase(raw, 'Virement direct')) return undefined;
  const prefix = startsWithBase(raw, base) ? base : 'Virement direct';
  if (raw === prefix) return undefined;
  const banque = raw.slice(prefix.length + BANQUE_SEP.length).trim();
  return (ANSAR_BANQUES as readonly string[]).includes(banque)
    ? (banque as AnsarBanque)
    : undefined;
}

/** Détail versement indirect : entreprise puis banque. */
export function parseIndirectVersement(
  mode: string | undefined | null,
): { entreprise: string; banque: string } | undefined {
  const base = paymentModeBase(mode);
  if (base !== PAYMENT_MODE.VIREMENT_INDIRECT) return undefined;
  const raw = mode?.trim() ?? '';
  const prefix = startsWithBase(raw, PAYMENT_MODE.VIREMENT_INDIRECT)
    ? PAYMENT_MODE.VIREMENT_INDIRECT
    : startsWithBase(raw, 'Virement indirect')
      ? 'Virement indirect'
      : null;
  if (!prefix || raw === prefix) return undefined;
  const rest = raw.slice(prefix.length + BANQUE_SEP.length);
  const sep = rest.indexOf(BANQUE_SEP);
  if (sep < 0) {
    const entreprise = rest.trim();
    if (!entreprise) return undefined;
    return { entreprise, banque: '' };
  }
  const entreprise = rest.slice(0, sep).trim();
  const banque = rest.slice(sep + BANQUE_SEP.length).trim();
  if (!entreprise) return undefined;
  return { entreprise, banque };
}

/** Mode enregistré : « Versement direct · Afriland ». */
export function formatPaymentModeWithBanque(
  mode: string | undefined | null,
  banque: string | undefined | null,
): string | undefined {
  const m = normalizePaymentMode(mode);
  if (!m) return undefined;
  if (!isPaiementVersBanque(m)) return m;
  const b = banque?.trim();
  if (!b || !(ANSAR_BANQUES as readonly string[]).includes(b)) return m;
  return `${PAYMENT_MODE.VIREMENT_DIRECT}${BANQUE_SEP}${b}`;
}

/** Mode enregistré : « Versement indirect · Entreprise · Banque » (banque optionnelle en cours de saisie). */
export function formatIndirectVersement(
  entreprise: string | undefined | null,
  banque: string | undefined | null,
): string | undefined {
  const e = entreprise?.trim();
  const b = banque?.trim();
  if (!e && !b) return PAYMENT_MODE.VIREMENT_INDIRECT;
  if (e && !b) return `${PAYMENT_MODE.VIREMENT_INDIRECT}${BANQUE_SEP}${e}`;
  if (!e) return PAYMENT_MODE.VIREMENT_INDIRECT;
  return `${PAYMENT_MODE.VIREMENT_INDIRECT}${BANQUE_SEP}${e}${BANQUE_SEP}${b}`;
}

export function paymentModeFamily(mode: string | undefined | null): PaymentModeFamily | '' {
  const m = normalizePaymentMode(mode);
  if (!m) return '';
  if (m === PAYMENT_MODE.ESPECES) return 'especes';
  if (m === PAYMENT_MODE.CHEQUE) return 'cheque';
  if (m === PAYMENT_MODE.MTN || m === PAYMENT_MODE.ORANGE) return 'electronique';
  if (m === PAYMENT_MODE.VIREMENT_DIRECT || m === PAYMENT_MODE.VIREMENT_INDIRECT) return 'virement';
  const low = m.toLowerCase();
  if (low.includes('virement') || low.includes('versement')) return 'virement';
  if (low.includes('mobile') || low.includes('mtn') || low.includes('orange')) return 'electronique';
  if (m === PAYMENT_MODE.ESPECES || low.includes('espèce')) return 'especes';
  if (low.includes('chèque') || low.includes('cheque')) return 'cheque';
  return '';
}

/**
 * - caisse : espèces, chèque, MTN, Orange
 * - aucun : versement (direct ou indirect) : traçabilité seule
 */
export function paymentTreasuryDestination(
  mode: string | undefined | null,
): PaymentTreasuryDestination {
  const m = normalizePaymentMode(mode);
  if (!m) return 'caisse';
  if (m === PAYMENT_MODE.VIREMENT_INDIRECT || m === PAYMENT_MODE.VIREMENT_DIRECT) return 'aucun';
  const low = m.toLowerCase();
  if (low.includes('virement') || low.includes('versement')) return 'aucun';
  return 'caisse';
}

/** Versement direct : banque Ansar pour traçabilité. */
export function isPaiementVersBanque(mode: string | undefined | null): boolean {
  const m = normalizePaymentMode(mode);
  if (!m) return false;
  if (m === PAYMENT_MODE.VIREMENT_DIRECT) return true;
  const low = m.toLowerCase();
  if (low.includes('indirect')) return false;
  return low.includes('virement') || (low.includes('versement') && low.includes('direct'));
}

/** Versement sur compte de l’entreprise (fournisseur), au nom d’Ansar. */
export function isVirementIndirect(mode: string | undefined | null): boolean {
  return isVersementIndirect(mode);
}

export function isVersementIndirect(mode: string | undefined | null): boolean {
  const m = normalizePaymentMode(mode);
  if (!m) return false;
  if (m === PAYMENT_MODE.VIREMENT_INDIRECT) return true;
  const low = m.toLowerCase();
  return low.includes('indirect') && (low.includes('virement') || low.includes('versement'));
}

export function isPaiementElectronique(mode: string | undefined | null): boolean {
  return paymentModeFamily(mode) === 'electronique';
}

export function defaultModeForFamily(family: PaymentModeFamily): PaymentModeValue {
  switch (family) {
    case 'especes':
      return PAYMENT_MODE.ESPECES;
    case 'cheque':
      return PAYMENT_MODE.CHEQUE;
    case 'electronique':
      return PAYMENT_MODE.MTN;
    case 'virement':
      return PAYMENT_MODE.VIREMENT_DIRECT;
  }
}

export const PAYMENT_FAMILY_OPTIONS: { value: PaymentModeFamily; label: string; hint: string }[] = [
  { value: 'especes', label: 'Espèces', hint: 'Encaissement / sortie en caisse' },
  { value: 'cheque', label: 'Chèque', hint: 'Encaissement / sortie en caisse' },
  {
    value: 'electronique',
    label: 'Paiement électronique',
    hint: 'MTN Mobile Money ou Orange Money',
  },
  {
    value: 'virement',
    label: 'Versement bancaire',
    hint: 'Direct (banque Ansar) ou indirect (compte de l’entreprise)',
  },
];

export const ELECTRONIC_PAYMENT_OPTIONS: { value: PaymentModeValue; label: string }[] = [
  { value: PAYMENT_MODE.MTN, label: 'MTN Mobile Money' },
  { value: PAYMENT_MODE.ORANGE, label: 'Orange Money' },
];

export const VIREMENT_KIND_OPTIONS: {
  value: PaymentModeValue;
  label: string;
  hint: string;
}[] = [
  {
    value: PAYMENT_MODE.VIREMENT_DIRECT,
    label: 'Direct',
    hint: 'Banque Ansar (Afriland, CBC, UBA, CCA) pour la traçabilité',
  },
  {
    value: PAYMENT_MODE.VIREMENT_INDIRECT,
    label: 'Indirect',
    hint: 'Versement sur le compte bancaire de l’entreprise (au nom d’Ansar)',
  },
];

export function paymentModeHint(mode: string | undefined | null): string {
  if (isPaiementVersBanque(mode)) {
    const banque = parseAnsarBanque(mode);
    return banque
      ? `Versement direct sur ${banque} (traçabilité).`
      : 'Choisis la banque Ansar (Afriland, CBC, UBA, CCA) pour la traçabilité.';
  }
  if (isVersementIndirect(mode)) {
    const detail = parseIndirectVersement(mode);
    return detail
      ? `Versement indirect chez ${detail.entreprise} (${detail.banque}).`
      : 'Choisis l’entreprise, puis la banque où le versement a été fait.';
  }
  if (isPaiementElectronique(mode)) {
    return 'Paiement électronique (MTN / Orange) enregistré en caisse.';
  }
  return 'Ce montant sera enregistré en caisse.';
}

/** Contrôle que les détails de traçabilité versement sont complets. */
export function missingVersementDetailMessage(mode: string | undefined | null): string | undefined {
  if (isPaiementVersBanque(mode) && !parseAnsarBanque(mode)) {
    return 'Choisis la banque Ansar (Afriland, CBC, UBA ou CCA) pour le versement direct.';
  }
  if (isVersementIndirect(mode)) {
    const detail = parseIndirectVersement(mode);
    if (!detail?.entreprise) return 'Choisis l’entreprise pour le versement indirect.';
    if (!detail.banque) return 'Choisis la banque de l’entreprise où le versement a été fait.';
  }
  return undefined;
}
