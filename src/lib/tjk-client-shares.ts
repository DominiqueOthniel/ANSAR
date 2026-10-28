/**
 * Parts clients d’une opération TJK (ventilation multi-clients d’un bon).
 * Aligné sur le stockage JSON `clientShares` (server / localStorage).
 */

export interface TjkClientShare {
  id: string;
  clientId?: string;
  clientNom: string;
  quantite?: number;
  /** Montant attribué à ce client (FCFA). */
  montant?: number;
}

export function newTjkClientShare(
  partial?: Partial<Omit<TjkClientShare, 'id'>>,
): TjkClientShare {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tjk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    clientNom: partial?.clientNom ?? '',
    clientId: partial?.clientId,
    quantite: partial?.quantite,
    montant: partial?.montant,
  };
}

export function sumTjkShareQuantite(shares: TjkClientShare[]): number {
  return shares.reduce(
    (s, p) => s + (p.quantite != null && Number.isFinite(p.quantite) && p.quantite > 0 ? p.quantite : 0),
    0,
  );
}

export function sumTjkShareMontant(shares: TjkClientShare[]): number {
  return shares.reduce(
    (s, p) => s + (p.montant != null && Number.isFinite(p.montant) && p.montant > 0 ? p.montant : 0),
    0,
  );
}

export function tjkShareHasClient(p: TjkClientShare): boolean {
  return Boolean(p.clientId?.trim() || p.clientNom.trim());
}

/** Parts valides : client renseigné et quantité > 0. */
export function filterValidTjkShares(shares: TjkClientShare[]): TjkClientShare[] {
  return shares.filter(
    (p) =>
      tjkShareHasClient(p) &&
      p.quantite != null &&
      Number.isFinite(p.quantite) &&
      p.quantite > 0,
  );
}

export function formatTjkSharesLabel(shares: TjkClientShare[] | undefined): string {
  if (!shares?.length) return '';
  const names = shares
    .map((p) => p.clientNom.trim())
    .filter(Boolean);
  return names.join(', ');
}

/**
 * Reconstruit les parts depuis une opération legacy (un seul client)
 * ou depuis `clientShares` déjà persisté.
 */
export function coerceTjkClientShares(op: {
  clientId?: string;
  clientNom?: string;
  quantite?: number;
  prixTrans?: number;
  clientShares?: TjkClientShare[] | null;
}): TjkClientShare[] {
  if (Array.isArray(op.clientShares) && op.clientShares.length > 0) {
    return op.clientShares.map((p) => {
      const base = newTjkClientShare({
        clientId: p.clientId,
        clientNom: p.clientNom ?? '',
        quantite: p.quantite,
        montant: p.montant,
      });
      return p.id?.trim() ? { ...base, id: p.id } : base;
    });
  }
  const nom = op.clientNom?.trim() || '';
  if (op.clientId || nom) {
    return [
      newTjkClientShare({
        clientId: op.clientId,
        clientNom: nom,
        quantite: op.quantite,
        montant: op.prixTrans,
      }),
    ];
  }
  return [newTjkClientShare()];
}

export type TjkSharesValidation =
  | { ok: true; shares: TjkClientShare[]; quantite: number; montantSum: number }
  | { ok: false; message: string };

/** Valide la ventilation : au moins une part, quantités positives, montants cohérents. */
export function validateTjkClientShares(
  shares: TjkClientShare[],
  opts?: { maxQuantite?: number },
): TjkSharesValidation {
  const named = shares.filter(tjkShareHasClient);
  if (named.length === 0) {
    return { ok: false, message: 'Indiquez au moins un client (fiche ou nom libre).' };
  }
  for (const p of named) {
    if (p.quantite == null || !Number.isFinite(p.quantite) || p.quantite <= 0) {
      const label = p.clientNom.trim() || 'ce client';
      return {
        ok: false,
        message: `Indiquez une quantité valide pour ${label}.`,
      };
    }
    if (p.montant != null && (!Number.isFinite(p.montant) || p.montant < 0)) {
      const label = p.clientNom.trim() || 'ce client';
      return {
        ok: false,
        message: `Montant invalide pour ${label}.`,
      };
    }
  }
  const valid = filterValidTjkShares(shares);
  if (valid.length === 0) {
    return { ok: false, message: 'Indiquez au moins un client avec une quantité.' };
  }
  const quantite = sumTjkShareQuantite(valid);
  if (opts?.maxQuantite != null && quantite > opts.maxQuantite + 1e-6) {
    return {
      ok: false,
      message: `Quantité trop élevée : reste ${Math.max(0, opts.maxQuantite).toLocaleString('fr-FR')} sur ce bon TJK.`,
    };
  }
  return {
    ok: true,
    shares: valid,
    quantite,
    montantSum: sumTjkShareMontant(valid),
  };
}
