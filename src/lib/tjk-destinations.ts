/**
 * Catalogue destinations TJK (montants forfaitaires pour le formulaire d’opération).
 */

import { tjkDestinationsApi, type TjkDestinationPayload } from '@/lib/api';

export const TJK_DESTINATIONS_STORAGE_KEY = 'tjk_destinations';

export interface TjkDestination {
  id: string;
  libelle: string;
  quantiteDefaut?: number;
  poidsUniteKg?: number;
  /** Prix au tonnage (FCFA / t). */
  prixTonnage?: number;
  /** Montant final (tonnage défaut × prix tonnage), ou ancien forfait. */
  prixTrans?: number;
  prixTransport?: number;
  totalTransport?: number;
  prixVoyage?: number;
  totalPaiement?: number;
  createdAt?: string;
}

function parseNum(val: unknown): number | undefined {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function normalizeTjkDestination(r: Record<string, unknown>): TjkDestination {
  return {
    id: String(r.id),
    libelle: String(r.libelle ?? '').trim(),
    quantiteDefaut: parseNum(r.quantiteDefaut),
    poidsUniteKg: parseNum(r.poidsUniteKg),
    prixTonnage: parseNum(r.prixTonnage),
    prixTrans: parseNum(r.prixTrans),
    prixTransport: parseNum(r.prixTransport),
    totalTransport: parseNum(r.totalTransport),
    prixVoyage: parseNum(r.prixVoyage),
    totalPaiement: parseNum(r.totalPaiement),
    createdAt: r.createdAt
      ? String(r.createdAt)
      : r.created_at
        ? String(r.created_at)
        : undefined,
  };
}

export function isRemoteTjkDestinations(): boolean {
  return Boolean(import.meta.env.VITE_API_URL?.trim());
}

function loadLocal(): TjkDestination[] {
  try {
    const raw = localStorage.getItem(TJK_DESTINATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => normalizeTjkDestination(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

function saveLocal(rows: TjkDestination[]): void {
  localStorage.setItem(TJK_DESTINATIONS_STORAGE_KEY, JSON.stringify(rows));
}

let _cache: TjkDestination[] | null = null;
let _useApi = isRemoteTjkDestinations();

export async function refreshTjkDestinationsFromApi(): Promise<TjkDestination[]> {
  if (_useApi && isRemoteTjkDestinations()) {
    try {
      const rows = await tjkDestinationsApi.getAll();
      _cache = rows.map((r) => normalizeTjkDestination(r as Record<string, unknown>));
      return _cache;
    } catch {
      _useApi = false;
    }
  }
  _cache = loadLocal();
  return _cache;
}

export async function createTjkDestination(
  payload: TjkDestinationPayload,
): Promise<TjkDestination> {
  if (_useApi && isRemoteTjkDestinations()) {
    try {
      const row = await tjkDestinationsApi.create(payload);
      await refreshTjkDestinationsFromApi();
      return normalizeTjkDestination(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }
  const created: TjkDestination = {
    id: crypto.randomUUID(),
    libelle: payload.libelle.trim(),
    quantiteDefaut: payload.quantiteDefaut ?? undefined,
    poidsUniteKg: payload.poidsUniteKg ?? undefined,
    prixTonnage: payload.prixTonnage ?? undefined,
    prixTrans: payload.prixTrans ?? undefined,
    prixTransport: payload.prixTransport ?? undefined,
    totalTransport: payload.totalTransport ?? undefined,
    prixVoyage: payload.prixVoyage ?? undefined,
    totalPaiement: payload.totalPaiement ?? undefined,
    createdAt: new Date().toISOString(),
  };
  const next = [created, ...loadLocal()];
  saveLocal(next);
  _cache = next;
  return created;
}

export async function updateTjkDestination(
  id: string,
  payload: Partial<TjkDestinationPayload>,
): Promise<TjkDestination> {
  if (_useApi && isRemoteTjkDestinations()) {
    try {
      const row = await tjkDestinationsApi.update(id, payload);
      await refreshTjkDestinationsFromApi();
      return normalizeTjkDestination(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }
  const local = loadLocal();
  const idx = local.findIndex((d) => d.id === id);
  if (idx < 0) throw new Error('Destination introuvable.');
  const prev = local[idx];
  const updated: TjkDestination = {
    ...prev,
    libelle: payload.libelle !== undefined ? payload.libelle.trim() : prev.libelle,
    quantiteDefaut:
      payload.quantiteDefaut !== undefined ? payload.quantiteDefaut ?? undefined : prev.quantiteDefaut,
    poidsUniteKg:
      payload.poidsUniteKg !== undefined ? payload.poidsUniteKg ?? undefined : prev.poidsUniteKg,
    prixTonnage:
      payload.prixTonnage !== undefined ? payload.prixTonnage ?? undefined : prev.prixTonnage,
    prixTrans: payload.prixTrans !== undefined ? payload.prixTrans ?? undefined : prev.prixTrans,
    prixTransport:
      payload.prixTransport !== undefined ? payload.prixTransport ?? undefined : prev.prixTransport,
    totalTransport:
      payload.totalTransport !== undefined
        ? payload.totalTransport ?? undefined
        : prev.totalTransport,
    prixVoyage: payload.prixVoyage !== undefined ? payload.prixVoyage ?? undefined : prev.prixVoyage,
    totalPaiement:
      payload.totalPaiement !== undefined ? payload.totalPaiement ?? undefined : prev.totalPaiement,
  };
  const next = [...local];
  next[idx] = updated;
  saveLocal(next);
  _cache = next;
  return updated;
}

export async function deleteTjkDestination(id: string): Promise<void> {
  if (_useApi && isRemoteTjkDestinations()) {
    try {
      await tjkDestinationsApi.delete(id);
      await refreshTjkDestinationsFromApi();
      return;
    } catch {
      _useApi = false;
    }
  }
  const next = loadLocal().filter((d) => d.id !== id);
  saveLocal(next);
  _cache = next;
}

export function findTjkDestinationByLibelle(
  destinations: TjkDestination[],
  libelle: string,
): TjkDestination | undefined {
  const norm = libelle.trim().toLowerCase();
  if (!norm) return undefined;
  return destinations.find((d) => d.libelle.trim().toLowerCase() === norm);
}
