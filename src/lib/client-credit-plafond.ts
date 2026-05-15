import { matchClientReference, normName } from '@/lib/client-tier-match';

export type ClientTierLike = { id: string; nom: string; type: string; plafondCredit?: number };

export type CreditLike = {
  id: string;
  type: string;
  preteur: string;
  montantTotal: number;
  montantRembourse: number;
  tauxInteret?: number;
  /** Rattachement explicite à une fiche client (commande / vente sans paiement). */
  clientTierId?: string;
};

function parseNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

export function getMontantCibleCredit(c: Pick<CreditLike, 'montantTotal' | 'tauxInteret'>): number {
  const taux = c.tauxInteret ?? 0;
  return c.montantTotal + (c.montantTotal * taux) / 100;
}

/** Reste à recouvrer (montant cible avec intérêts − déjà remboursé). */
export function getResteCredit(c: CreditLike): number {
  return Math.max(0, getMontantCibleCredit(c) - c.montantRembourse);
}

/** Une créance client (commande sans paiement) est liée par `clientTierId`, sinon par le nom saisi (champ technique « preteur »). */
function pretAccordeRattacheAuClient(c: CreditLike, client: { id: string; nom: string }): boolean {
  if (c.type !== 'pret_accorde') return false;
  if (c.clientTierId) return c.clientTierId === client.id;
  return matchClientReference(c.preteur, client.nom);
}

/** Somme des restes dus sur les commandes / ventes à crédit rattachées à ce client. */
export function sumEncoursPretsPourClient(
  credits: CreditLike[],
  client: { id: string; nom: string },
  excludeCreditId?: string,
): number {
  return credits
    .filter((c) => c.id !== excludeCreditId)
    .filter((c) => pretAccordeRattacheAuClient(c, client))
    .reduce((s, c) => s + getResteCredit(c), 0);
}

/**
 * Trouve la fiche client à partir du texte saisi (nom client / contrepartie).
 * Priorité : égalité normalisée, puis correspondance large.
 */
export function findClientTierForPreteur(
  thirdParties: ClientTierLike[],
  preteur: string,
): ClientTierLike | undefined {
  const clients = thirdParties.filter((c) => c.type === 'client');
  const p = preteur.trim();
  if (!p) return undefined;
  const n = normName(p);
  const exact = clients.find((c) => normName(c.nom) === n);
  if (exact) return exact;
  return clients.find((c) => matchClientReference(p, c.nom));
}

export function normalizeCreditLike(r: Record<string, unknown>): CreditLike {
  return {
    id: String(r.id),
    type: String(r.type),
    preteur: String(r.preteur ?? ''),
    montantTotal: parseNum(r.montantTotal),
    montantRembourse: parseNum(r.montantRembourse),
    tauxInteret: r.tauxInteret != null ? parseNum(r.tauxInteret) : undefined,
    clientTierId:
      r.clientTierId != null && String(r.clientTierId) !== '' ? String(r.clientTierId) : undefined,
  };
}

export function checkPretAccordePlafond(params: {
  credits: CreditLike[];
  thirdParties: ClientTierLike[];
  preteur: string;
  /** Si renseigné, le plafond s’applique à cette fiche sans dépendre du nom saisi manuellement. */
  clientTierId?: string | null;
  montantTotal: number;
  tauxInteret?: number;
  excludeCreditId?: string;
}): { ok: true } | { ok: false; message: string } {
  const client = params.clientTierId
    ? params.thirdParties.find((tp) => tp.type === 'client' && tp.id === params.clientTierId)
    : findClientTierForPreteur(params.thirdParties, params.preteur);
  if (!client || client.plafondCredit == null) return { ok: true };
  const plafond = Number(client.plafondCredit);
  if (!Number.isFinite(plafond) || plafond < 0) return { ok: true };
  const encours = sumEncoursPretsPourClient(
    params.credits,
    { id: client.id, nom: client.nom },
    params.excludeCreditId,
  );
  const newCible = getMontantCibleCredit({
    montantTotal: params.montantTotal,
    tauxInteret: params.tauxInteret ?? 0,
  });
  if (encours + newCible <= plafond + 0.01) return { ok: true };
  const dispo = Math.max(0, plafond - encours);
  return {
    ok: false,
    message: `Plafond « ${client.nom} » : ${Math.round(dispo).toLocaleString('fr-FR')} FCFA encore disponibles (encours commandes non payées ${Math.round(encours).toLocaleString('fr-FR')} FCFA / plafond ${Math.round(plafond).toLocaleString('fr-FR')} FCFA). Cette nouvelle ligne représente ${Math.round(newCible).toLocaleString('fr-FR')} FCFA à recouvrer (montant + % si renseigné).`,
  };
}
