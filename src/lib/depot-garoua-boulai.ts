/**
 * Dépôt ciment Garoua-Boulai (safe house) : mouvements et stock.
 */

import type { SupplierLoading } from '@/contexts/AppContext';
import { depotGarouaBoulaiApi } from '@/lib/api';
import { DEPOT_GAROUA_BOULAI } from '@/lib/hub-transit';
import {
  formatSupplierLoadingStatusFr,
  getLoadingRemainderQty,
  isLoadingAtHub,
} from '@/lib/supplier-loadings';

export { DEPOT_GAROUA_BOULAI };

export const DEPOT_GAROUA_STORAGE_KEY = 'depot_garoua_boulai_movements';

export type DepotGarouaMovementType = 'entree' | 'retrait';

export interface DepotGarouaMovement {
  id: string;
  date: string;
  truckId?: string;
  camionImmatriculation?: string;
  type: DepotGarouaMovementType;
  quantite: number;
  stockFinal: number;
  notes?: string;
  utilisateur?: string;
  createdAt?: string;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

export function normalizeDepotGarouaMovement(r: Record<string, unknown>): DepotGarouaMovement {
  return {
    id: String(r.id),
    date: String(r.date).split('T')[0],
    truckId: r.truckId ? String(r.truckId) : undefined,
    camionImmatriculation: r.camionImmatriculation
      ? String(r.camionImmatriculation)
      : undefined,
    type: r.type as DepotGarouaMovementType,
    quantite: parseNum(r.quantite),
    stockFinal: parseNum(r.stockFinal),
    notes: r.notes ? String(r.notes) : undefined,
    utilisateur: r.utilisateur ? String(r.utilisateur) : undefined,
    createdAt: r.createdAt ? String(r.createdAt) : undefined,
  };
}

function loadLocalMovements(): DepotGarouaMovement[] {
  try {
    const raw = localStorage.getItem(DEPOT_GAROUA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMovements(rows: DepotGarouaMovement[]): void {
  localStorage.setItem(DEPOT_GAROUA_STORAGE_KEY, JSON.stringify(rows));
}

export function computeDepotStockFromMovements(
  movements: readonly Pick<DepotGarouaMovement, 'type' | 'quantite'>[],
): number {
  return movements.reduce(
    (sum, m) => sum + (m.type === 'entree' ? m.quantite : -m.quantite),
    0,
  );
}

export function recalculateDepotStockFinals(
  movements: DepotGarouaMovement[],
): DepotGarouaMovement[] {
  const sorted = [...movements].sort((a, b) => {
    const da = a.date.localeCompare(b.date);
    if (da !== 0) return da;
    return (a.createdAt || a.id).localeCompare(b.createdAt || b.id);
  });
  let stock = 0;
  return sorted.map((m) => {
    stock += m.type === 'entree' ? m.quantite : -m.quantite;
    return { ...m, stockFinal: stock };
  });
}

export function previewDepotStockFinal(
  movements: readonly DepotGarouaMovement[],
  draft: Pick<DepotGarouaMovement, 'type' | 'quantite'>,
  replaceId?: string,
): number {
  const base = movements.filter((m) => m.id !== replaceId);
  const stock = computeDepotStockFromMovements(base);
  return stock + (draft.type === 'entree' ? draft.quantite : -draft.quantite);
}

export function formatDepotGarouaTypeFr(type: DepotGarouaMovementType): string {
  return type === 'entree' ? 'Entrée ciment' : 'Retrait ciment';
}


export function isGarouaBoulaiLocation(text: string | undefined | null): boolean {
  const raw = String(text ?? '').trim();
  if (!raw) return false;
  if (raw === DEPOT_GAROUA_BOULAI) return true;
  return /\bgaroua[\s-]?boulai\b/i.test(raw);
}

/** Bon ou marchandise localisé au dépôt Garoua-Boulai (hub, lieu ou notes). */
export function isSupplierLoadingAtGarouaBoulai(
  loading: Pick<SupplierLoading, 'hubArrivee' | 'lieu' | 'notes' | 'statut'>,
): boolean {
  if (loading.statut === 'annule') return false;
  return (
    isGarouaBoulaiLocation(loading.hubArrivee) ||
    isGarouaBoulaiLocation(loading.lieu) ||
    isGarouaBoulaiLocation(loading.notes)
  );
}

export type GarouaBoulaiLoadingRow = SupplierLoading & {
  resteAuDepot: number | null;
  quantiteAffectee: number;
};

export function listGarouaBoulaiLoadings(loadings: SupplierLoading[]): GarouaBoulaiLoadingRow[] {
  return loadings
    .filter(isSupplierLoadingAtGarouaBoulai)
    .map((l) => {
      const resteAuDepot = getLoadingRemainderQty(l.quantite, l.assignments);
      const quantiteAffectee =
        l.quantite != null && resteAuDepot != null ? Math.max(0, l.quantite - resteAuDepot) : 0;
      return { ...l, resteAuDepot, quantiteAffectee };
    });
}

export function summarizeGarouaBoulaiLoadings(loadings: SupplierLoading[]) {
  const rows = listGarouaBoulaiLoadings(loadings);
  let stockReste = 0;
  let stockTotal = 0;
  let withQty = 0;
  let auHub = 0;
  let enAttente = 0;

  for (const l of rows) {
    if (l.quantite != null && l.quantite > 0) {
      stockTotal += l.quantite;
      withQty += 1;
      if (l.resteAuDepot != null && l.resteAuDepot > 0) {
        stockReste += l.resteAuDepot;
      }
    }
    if (isLoadingAtHub(l.statut) || l.statut === 'en_attente_affectation') auHub += 1;
    if (
      l.statut === 'en_attente_affectation' ||
      l.statut === 'partiellement_affecte' ||
      (l.resteAuDepot != null && l.resteAuDepot > 1e-6)
    ) {
      enAttente += 1;
    }
  }

  return {
    rows,
    count: rows.length,
    withQty,
    stockReste,
    stockTotal,
    auHub,
    enAttente,
  };
}

export function formatGarouaBoulaiLoadingStatut(l: SupplierLoading): string {
  return formatSupplierLoadingStatusFr(l.statut);
}

let _cache: DepotGarouaMovement[] = [];
let _useApi = true;

export function getDepotGarouaMovementsCache(): DepotGarouaMovement[] {
  return [..._cache];
}

export async function refreshDepotGarouaFromApi(): Promise<DepotGarouaMovement[]> {
  try {
    const rows = await depotGarouaBoulaiApi.getAll();
    _useApi = true;
    _cache = Array.isArray(rows)
      ? rows.map((r) => normalizeDepotGarouaMovement(r as Record<string, unknown>))
      : [];
    return [..._cache];
  } catch {
    _useApi = false;
    _cache = loadLocalMovements();
    return [..._cache];
  }
}

export async function createDepotGarouaMovement(
  payload: Omit<DepotGarouaMovement, 'id' | 'stockFinal'> & { stockFinal?: number },
): Promise<DepotGarouaMovement> {
  if (_useApi) {
    try {
      const row = await depotGarouaBoulaiApi.create(payload);
      await refreshDepotGarouaFromApi();
      return normalizeDepotGarouaMovement(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }

  const local = loadLocalMovements();
  const stockBefore = computeDepotStockFromMovements(local);
  if (payload.type === 'retrait' && payload.quantite > stockBefore + 1e-9) {
    throw new Error(
      `Stock insuffisant au dépôt (${stockBefore.toLocaleString('fr-FR')} disponible).`,
    );
  }
  const created: DepotGarouaMovement = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: payload.date,
    truckId: payload.truckId,
    camionImmatriculation: payload.camionImmatriculation,
    type: payload.type,
    quantite: payload.quantite,
    stockFinal: 0,
    notes: payload.notes,
    utilisateur: payload.utilisateur,
    createdAt: new Date().toISOString(),
  };
  const next = recalculateDepotStockFinals([...local, created]);
  saveLocalMovements(next);
  _cache = next;
  return next.find((m) => m.id === created.id)!;
}

export async function updateDepotGarouaMovement(
  id: string,
  payload: Partial<Omit<DepotGarouaMovement, 'id'>>,
): Promise<DepotGarouaMovement> {
  if (_useApi) {
    try {
      const row = await depotGarouaBoulaiApi.update(id, payload);
      await refreshDepotGarouaFromApi();
      return normalizeDepotGarouaMovement(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }

  const local = loadLocalMovements();
  const idx = local.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error('Mouvement introuvable.');
  const updated = { ...local[idx], ...payload };
  const draft = [...local];
  draft[idx] = updated;
  const stockCheck = computeDepotStockFromMovements(
    recalculateDepotStockFinals(draft).map((m) => ({ type: m.type, quantite: m.quantite })),
  );
  if (stockCheck < -1e-9) {
    throw new Error('Stock dépôt insuffisant après modification.');
  }
  const next = recalculateDepotStockFinals(draft);
  saveLocalMovements(next);
  _cache = next;
  return next.find((m) => m.id === id)!;
}

export async function deleteDepotGarouaMovement(id: string): Promise<void> {
  if (_useApi) {
    try {
      await depotGarouaBoulaiApi.delete(id);
      await refreshDepotGarouaFromApi();
      return;
    } catch {
      _useApi = false;
    }
  }

  const next = recalculateDepotStockFinals(loadLocalMovements().filter((m) => m.id !== id));
  saveLocalMovements(next);
  _cache = next;
}
