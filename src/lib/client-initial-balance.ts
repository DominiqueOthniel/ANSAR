import { creditsApi } from '@/lib/api';
import { CREDITS_DATA_STORAGE_KEY } from '@/lib/credits-constants';
import {
  checkPretAccordePlafond,
  normalizeCreditLike,
  type ClientTierLike,
  type CreditLike,
} from '@/lib/client-credit-plafond';

const USE_CREDITS_API = Boolean(import.meta.env.VITE_API_URL?.trim());

export const CLIENT_INITIAL_BALANCE_INTITULE = 'Dette / solde initial';

export type CreateClientInitialBalanceParams = {
  clientId: string;
  clientNom: string;
  /** Montant dû par le client (0 = retirer la ligne dette initiale si possible). */
  montant: number;
  credits: CreditLike[];
  thirdParties: ClientTierLike[];
};

function parseNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

async function loadCreditsRaw(): Promise<Record<string, unknown>[]> {
  if (USE_CREDITS_API) {
    const data = await creditsApi.getAll();
    return Array.isArray(data) ? data : [];
  }
  try {
    const raw = localStorage.getItem(CREDITS_DATA_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCreditsRawLocal(list: Record<string, unknown>[]): void {
  localStorage.setItem(CREDITS_DATA_STORAGE_KEY, JSON.stringify(list));
}

export function findClientInitialBalanceRow(
  rows: Record<string, unknown>[],
  clientId: string,
): Record<string, unknown> | undefined {
  return rows.find((r) => {
    if (String(r.type) !== 'pret_accorde') return false;
    if (String(r.intitule ?? '').trim() !== CLIENT_INITIAL_BALANCE_INTITULE) return false;
    const cid = r.clientTierId != null && String(r.clientTierId) !== '' ? String(r.clientTierId) : '';
    return cid === clientId;
  });
}

/** Montant actuel de la dette / solde initial (0 si aucune ligne). */
export async function getClientInitialBalanceMontant(
  clientId: string,
  _clientNom?: string,
): Promise<number> {
  const rows = await loadCreditsRaw();
  const found = findClientInitialBalanceRow(rows, clientId);
  if (!found) return 0;
  return Math.round(parseNum(found.montantTotal));
}

/** Crée une ligne « commande sans paiement » pour la dette / solde initial du client. */
export async function createClientInitialBalance(
  params: CreateClientInitialBalanceParams,
): Promise<void> {
  const montant = Math.round(Number(params.montant));
  if (!Number.isFinite(montant) || montant <= 0) return;

  const chk = checkPretAccordePlafond({
    credits: params.credits,
    thirdParties: params.thirdParties,
    preteur: params.clientNom,
    clientTierId: params.clientId,
    montantTotal: montant,
    tauxInteret: 0,
  });
  if (!chk.ok) throw new Error(chk.message);

  const today = new Date().toISOString().split('T')[0];
  const payload = {
    type: 'pret_accorde' as const,
    intitule: CLIENT_INITIAL_BALANCE_INTITULE,
    preteur: params.clientNom,
    clientTierId: params.clientId,
    montantTotal: montant,
    dateDebut: today,
    notes: 'Solde ou dette enregistré à la création de la fiche client.',
  };

  if (USE_CREDITS_API) {
    await creditsApi.create(payload);
    return;
  }

  const list = await loadCreditsRaw();
  if (!Array.isArray(list)) throw new Error('Registre crédits local invalide.');

  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `credit-${Date.now()}`;

  list.push({
    id,
    ...payload,
    montantRembourse: 0,
    tauxInteret: 0,
    statut: 'en_cours',
    remboursements: [],
  });
  saveCreditsRawLocal(list);
}

async function deleteClientInitialBalanceCredit(
  existing: Record<string, unknown>,
): Promise<void> {
  const remb = parseNum(existing.montantRembourse);
  if (remb > 0) {
    throw new Error(
      'Impossible de retirer la dette initiale : des remboursements sont déjà enregistrés sur cette ligne.',
    );
  }
  const id = String(existing.id);
  if (USE_CREDITS_API) {
    await creditsApi.delete(id);
    return;
  }
  const list = await loadCreditsRaw();
  saveCreditsRawLocal(list.filter((r) => String(r.id) !== id));
}

async function updateClientInitialBalanceCredit(
  existing: Record<string, unknown>,
  montant: number,
  clientNom: string,
  params: CreateClientInitialBalanceParams,
): Promise<void> {
  const remb = parseNum(existing.montantRembourse);
  if (montant < remb) {
    throw new Error(
      `Le montant ne peut pas être inférieur aux remboursements déjà saisis (${Math.round(remb).toLocaleString('fr-FR')} FCFA).`,
    );
  }

  const chk = checkPretAccordePlafond({
    credits: params.credits,
    thirdParties: params.thirdParties,
    preteur: clientNom,
    clientTierId: params.clientId,
    montantTotal: montant,
    tauxInteret: 0,
    excludeCreditId: String(existing.id),
  });
  if (!chk.ok) throw new Error(chk.message);

  const id = String(existing.id);
  if (USE_CREDITS_API) {
    await creditsApi.update(id, {
      montantTotal: montant,
      preteur: clientNom,
      intitule: CLIENT_INITIAL_BALANCE_INTITULE,
    });
    return;
  }

  const list = await loadCreditsRaw();
  const idx = list.findIndex((r) => String(r.id) === id);
  if (idx < 0) throw new Error('Ligne dette initiale introuvable.');
  list[idx] = {
    ...list[idx],
    montantTotal: montant,
    preteur: clientNom,
    intitule: CLIENT_INITIAL_BALANCE_INTITULE,
  };
  saveCreditsRawLocal(list);
}

/**
 * Crée, met à jour ou supprime la ligne dette initiale selon le montant saisi.
 * 0 ou vide → suppression si la ligne existe et n'a pas de remboursements.
 */
export async function upsertClientInitialBalance(
  params: CreateClientInitialBalanceParams,
): Promise<void> {
  const montant = Math.round(Number(params.montant));
  if (!Number.isFinite(montant) || montant < 0) {
    throw new Error('Montant de solde initial invalide.');
  }

  const rows = await loadCreditsRaw();
  const existing = findClientInitialBalanceRow(rows, params.clientId);

  if (montant <= 0) {
    if (existing) await deleteClientInitialBalanceCredit(existing);
    return;
  }

  if (existing) {
    await updateClientInitialBalanceCredit(existing, montant, params.clientNom, params);
    return;
  }

  await createClientInitialBalance({ ...params, montant });
}

export async function loadCreditsForPlafond(): Promise<CreditLike[]> {
  try {
    const rows = await loadCreditsRaw();
    return rows.map((r) =>
      normalizeCreditLike({
        ...r,
        montantRembourse: r.montantRembourse ?? 0,
      }),
    );
  } catch {
    return [];
  }
}

export function thirdPartiesToClientTierLike(
  thirdParties: { id: string; nom: string; type: string; plafondCredit?: number }[],
): ClientTierLike[] {
  return thirdParties.map((tp) => ({
    id: tp.id,
    nom: tp.nom,
    type: tp.type,
    plafondCredit: tp.plafondCredit,
  }));
}
