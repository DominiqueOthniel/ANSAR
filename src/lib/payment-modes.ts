/** Libellés canoniques enregistrés sur `invoice.modePaiement` / caisse. */
export const PAYMENT_MODE = {
  ESPECES: 'Espèces',
  CHEQUE: 'Chèque',
  MTN: 'MTN Mobile Money',
  ORANGE: 'Orange Money',
  VIREMENT_DIRECT: 'Virement direct',
  VIREMENT_INDIRECT: 'Virement indirect',
} as const;

export type PaymentModeValue = (typeof PAYMENT_MODE)[keyof typeof PAYMENT_MODE];

/** Famille UI (sélection en 2 étapes). */
export type PaymentModeFamily = 'especes' | 'cheque' | 'electronique' | 'virement';

/** Où le règlement impacte la trésorerie Ansar (espèces / mobile). */
export type PaymentTreasuryDestination = 'caisse' | 'aucun';

/**
 * Banques Ansar pour traçabilité d’un virement direct.
 * Liste fixe : aucun compte à créer dans le module Banque.
 */
export const ANSAR_BANQUES = ['Afriland', 'CBC', 'UBA', 'CCA'] as const;
export type AnsarBanque = (typeof ANSAR_BANQUES)[number];

const BANQUE_SEP = ' · ';

const LEGACY_TO_CANONICAL: Record<string, PaymentModeValue> = {
  Virement: PAYMENT_MODE.VIREMENT_DIRECT,
  'Virement bancaire': PAYMENT_MODE.VIREMENT_DIRECT,
  'Mobile Money': PAYMENT_MODE.MTN,
  'Mobile money': PAYMENT_MODE.MTN,
};

/** Extrait la banque traçabilité depuis un mode du type « Virement direct · Afriland ». */
export function parseAnsarBanque(mode: string | undefined | null): AnsarBanque | undefined {
  if (!mode?.trim()) return undefined;
  const raw = mode.trim();
  const sep = raw.lastIndexOf(BANQUE_SEP);
  if (sep < 0) return undefined;
  const banque = raw.slice(sep + BANQUE_SEP.length).trim();
  return (ANSAR_BANQUES as readonly string[]).includes(banque)
    ? (banque as AnsarBanque)
    : undefined;
}

/** Mode sans suffixe banque (pour famille / destination). */
export function paymentModeBase(mode: string | undefined | null): string | undefined {
  if (!mode?.trim()) return undefined;
  const raw = mode.trim();
  const sep = raw.lastIndexOf(BANQUE_SEP);
  if (sep > 0 && parseAnsarBanque(raw)) {
    return raw.slice(0, sep).trim();
  }
  return raw;
}

export function normalizePaymentMode(mode: string | undefined | null): string | undefined {
  const base = paymentModeBase(mode);
  if (!base) return undefined;
  return LEGACY_TO_CANONICAL[base] ?? base;
}

/** Mode enregistré : « Virement direct · Afriland » si banque choisie. */
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

export function paymentModeFamily(mode: string | undefined | null): PaymentModeFamily | '' {
  const m = normalizePaymentMode(mode);
  if (!m) return '';
  if (m === PAYMENT_MODE.ESPECES) return 'especes';
  if (m === PAYMENT_MODE.CHEQUE) return 'cheque';
  if (m === PAYMENT_MODE.MTN || m === PAYMENT_MODE.ORANGE) return 'electronique';
  if (m === PAYMENT_MODE.VIREMENT_DIRECT || m === PAYMENT_MODE.VIREMENT_INDIRECT) return 'virement';
  if (m.toLowerCase().includes('virement')) return 'virement';
  if (m.toLowerCase().includes('mobile') || m.toLowerCase().includes('mtn') || m.toLowerCase().includes('orange')) {
    return 'electronique';
  }
  if (m === PAYMENT_MODE.ESPECES || m.toLowerCase().includes('espèce')) return 'especes';
  if (m.toLowerCase().includes('chèque') || m.toLowerCase().includes('cheque')) return 'cheque';
  return '';
}

/**
 * - caisse : espèces, chèque, MTN, Orange
 * - aucun : virement (direct ou indirect) : traçabilité seule, pas d’écriture auto caisse/banque
 */
export function paymentTreasuryDestination(
  mode: string | undefined | null,
): PaymentTreasuryDestination {
  const m = normalizePaymentMode(mode);
  if (!m) return 'caisse';
  if (m === PAYMENT_MODE.VIREMENT_INDIRECT || m === PAYMENT_MODE.VIREMENT_DIRECT) return 'aucun';
  if (m.toLowerCase().includes('virement')) return 'aucun';
  return 'caisse';
}

/** Virement direct : choix d’une banque Ansar pour traçabilité. */
export function isPaiementVersBanque(mode: string | undefined | null): boolean {
  const m = normalizePaymentMode(mode);
  if (!m) return false;
  if (m === PAYMENT_MODE.VIREMENT_DIRECT) return true;
  return m.toLowerCase().includes('virement') && !m.toLowerCase().includes('indirect');
}

/** Versement via compte fournisseur, au nom d’Ansar. */
export function isVirementIndirect(mode: string | undefined | null): boolean {
  const m = normalizePaymentMode(mode);
  if (!m) return false;
  if (m === PAYMENT_MODE.VIREMENT_INDIRECT) return true;
  return m.toLowerCase().includes('virement') && m.toLowerCase().includes('indirect');
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
    label: 'Virement bancaire',
    hint: 'Direct (banque Ansar pour traçabilité) ou indirect (compte fournisseur au nom d’Ansar)',
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
    hint: 'Indiquer la banque Ansar (Afriland, CBC, UBA, CCA) pour la traçabilité',
  },
  {
    value: PAYMENT_MODE.VIREMENT_INDIRECT,
    label: 'Indirect',
    hint: 'Versé sur le compte du fournisseur, au nom d’Ansar',
  },
];

export function paymentModeHint(mode: string | undefined | null): string {
  if (isPaiementVersBanque(mode)) {
    const banque = parseAnsarBanque(mode);
    return banque
      ? `Virement direct sur ${banque} (traçabilité). Aucun compte à créer dans Banque.`
      : 'Choisis la banque Ansar (Afriland, CBC, UBA, CCA) pour la traçabilité. Aucun compte à créer.';
  }
  if (isVirementIndirect(mode)) {
    return 'Virement indirect : le client verse sur le compte du fournisseur au nom d’Ansar.';
  }
  if (isPaiementElectronique(mode)) {
    return 'Paiement électronique (MTN / Orange) enregistré en caisse.';
  }
  return 'Ce montant sera enregistré en caisse.';
}
