import type { BankAccount } from '@/lib/bank-types';

/** Libellés canoniques enregistrés sur `invoice.modePaiement`. */
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

/** Où le règlement impacte la trésorerie Ansar. */
export type PaymentTreasuryDestination = 'caisse' | 'banque' | 'aucun';

/** Banques des comptes Ansar (virement direct). */
export const ANSAR_BANQUE_KEYWORDS = ['afriland', 'cbc', 'uba', 'cca'] as const;

const LEGACY_TO_CANONICAL: Record<string, PaymentModeValue> = {
  Virement: PAYMENT_MODE.VIREMENT_DIRECT,
  'Virement bancaire': PAYMENT_MODE.VIREMENT_DIRECT,
  'Mobile Money': PAYMENT_MODE.MTN,
  'Mobile money': PAYMENT_MODE.MTN,
};

export function normalizePaymentMode(mode: string | undefined | null): string | undefined {
  if (!mode?.trim()) return undefined;
  const raw = mode.trim();
  return LEGACY_TO_CANONICAL[raw] ?? raw;
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
 * - banque : virement direct (comptes Afriland / CBC / UBA / CCA)
 * - aucun : virement indirect (versé chez le fournisseur au nom d’Ansar, pas encore sur un compte Ansar)
 */
export function paymentTreasuryDestination(
  mode: string | undefined | null,
): PaymentTreasuryDestination {
  const m = normalizePaymentMode(mode);
  if (!m) return 'caisse';
  if (m === PAYMENT_MODE.VIREMENT_INDIRECT) return 'aucun';
  if (m === PAYMENT_MODE.VIREMENT_DIRECT) return 'banque';
  if (m.toLowerCase().includes('virement') && m.toLowerCase().includes('indirect')) return 'aucun';
  if (m.toLowerCase().includes('virement')) return 'banque';
  return 'caisse';
}

/** Crédit / débit d’un compte bancaire Ansar. */
export function isPaiementVersBanque(mode: string | undefined | null): boolean {
  return paymentTreasuryDestination(mode) === 'banque';
}

/** Versement via compte fournisseur, au nom d’Ansar. */
export function isVirementIndirect(mode: string | undefined | null): boolean {
  return paymentTreasuryDestination(mode) === 'aucun';
}

export function isPaiementElectronique(mode: string | undefined | null): boolean {
  return paymentModeFamily(mode) === 'electronique';
}

export function isAnsarBankAccount(account: Pick<BankAccount, 'banque' | 'nom'>): boolean {
  const hay = `${account.banque} ${account.nom}`.toLowerCase();
  return ANSAR_BANQUE_KEYWORDS.some((k) => hay.includes(k));
}

/**
 * Comptes Ansar pour un virement direct.
 * Si aucun n’est reconnu (Afriland / CBC / UBA / CCA), on renvoie tous les comptes.
 */
export function listAnsarBankAccountsForDirectTransfer(accounts: BankAccount[]): {
  accounts: BankAccount[];
  filteredToAnsar: boolean;
} {
  const filtered = accounts.filter(isAnsarBankAccount);
  if (filtered.length > 0) return { accounts: filtered, filteredToAnsar: true };
  return { accounts, filteredToAnsar: false };
}

/** Libellé affichage : banque puis nom du compte. */
export function formatBankAccountLabel(account: Pick<BankAccount, 'banque' | 'nom' | 'numeroCompte'>): string {
  const banque = account.banque?.trim() || 'Banque';
  const nom = account.nom?.trim();
  const num = account.numeroCompte?.trim();
  const parts = [banque];
  if (nom && nom.toLowerCase() !== banque.toLowerCase()) parts.push(nom);
  if (num) parts.push(num);
  return parts.join(' · ');
}

export function resolveBankAccountLabel(
  compteId: string | undefined | null,
  accounts: BankAccount[],
): string {
  if (!compteId) return '—';
  const acc = accounts.find((a) => a.id === compteId);
  return acc ? formatBankAccountLabel(acc) : '—';
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
    hint: 'Direct (comptes Ansar) ou indirect (compte fournisseur au nom d’Ansar)',
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
    hint: 'Sur un compte Ansar (Afriland, CBC, UBA, CCA)',
  },
  {
    value: PAYMENT_MODE.VIREMENT_INDIRECT,
    label: 'Indirect',
    hint: 'Versé sur le compte du fournisseur, au nom d’Ansar',
  },
];

export function paymentModeHint(mode: string | undefined | null): string {
  const dest = paymentTreasuryDestination(mode);
  if (dest === 'banque') {
    return 'Ce montant sera crédité ou débité sur le compte bancaire Ansar choisi (Afriland, CBC, UBA, CCA).';
  }
  if (dest === 'aucun') {
    return 'Virement indirect : le client verse sur le compte du fournisseur au nom d’Ansar. Aucun mouvement sur les comptes Ansar pour l’instant.';
  }
  if (isPaiementElectronique(mode)) {
    return 'Paiement électronique (MTN / Orange) enregistré en caisse.';
  }
  return 'Ce montant sera enregistré en caisse.';
}
