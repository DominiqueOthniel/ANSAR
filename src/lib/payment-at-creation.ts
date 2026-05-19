/** Règlement saisi à la création (commande client ou dépense). */
export type PaymentAtCreationMode = 'en_attente' | 'soldee' | 'avance';

/** Déduit le mode de règlement à partir d’une facture existante. */
export function paymentModeFromInvoice(
  montantTTC: number,
  montantPaye?: number,
  statut?: 'en_attente' | 'payee',
): { mode: PaymentAtCreationMode; montantAvance?: number } {
  const total = Math.max(0, Math.round(montantTTC));
  const paye = Math.max(0, Math.round(montantPaye ?? 0));
  if (statut === 'payee' || (total > 0 && paye >= total - 0.01)) {
    return { mode: 'soldee', montantAvance: paye };
  }
  if (paye > 0) {
    return { mode: 'avance', montantAvance: paye };
  }
  return { mode: 'en_attente' };
}

export function resolvePaymentAtCreation(params: {
  mode: PaymentAtCreationMode;
  montantTotal: number;
  montantAvance?: number;
}): { montantPaye: number; statut: 'en_attente' | 'payee' } {
  const total = Math.max(0, Math.round(params.montantTotal));
  if (total <= 0 || params.mode === 'en_attente') {
    return { montantPaye: 0, statut: 'en_attente' };
  }
  if (params.mode === 'soldee') {
    return { montantPaye: total, statut: 'payee' };
  }
  const avance = Math.max(0, Math.round(params.montantAvance ?? 0));
  const paye = Math.min(avance, total);
  return {
    montantPaye: paye,
    statut: paye >= total - 0.01 ? 'payee' : 'en_attente',
  };
}
