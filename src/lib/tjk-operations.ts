/**
 * Registre opérations TJK (camions partenaires hors flotte Ansar).
 */

import { tjkOperationsApi, type TjkOperationPayload } from '@/lib/api';

export const TJK_OPERATIONS_STORAGE_KEY = 'tjk_operations';

export interface TjkOperation {
  id: string;
  date: string;
  clientId?: string;
  clientNom?: string;
  quantite: number;
  unite?: string;
  qualite?: string;
  destination?: string;
  camionNom?: string;
  camionImmatriculation?: string;
  referenceAtc?: string;
  /** Bon de chargement (mode TJK) lié à cette opération. */
  supplierLoadingId?: string;
  notes?: string;
  utilisateur?: string;
  createdAt?: string;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

export function isRemoteTjkOperations(): boolean {
  return Boolean(import.meta.env.VITE_API_URL?.trim());
}

export function normalizeTjkOperation(r: Record<string, unknown>): TjkOperation {
  return {
    id: String(r.id),
    date: String(r.date).split('T')[0],
    clientId: r.clientId ? String(r.clientId) : undefined,
    clientNom: r.clientNom ? String(r.clientNom) : undefined,
    quantite: parseNum(r.quantite),
    unite: r.unite ? String(r.unite) : undefined,
    qualite: r.qualite ? String(r.qualite) : undefined,
    destination: r.destination ? String(r.destination) : undefined,
    camionNom: r.camionNom ? String(r.camionNom) : undefined,
    camionImmatriculation: r.camionImmatriculation ? String(r.camionImmatriculation) : undefined,
    referenceAtc: r.referenceAtc ? String(r.referenceAtc) : undefined,
    supplierLoadingId: r.supplierLoadingId ? String(r.supplierLoadingId) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    utilisateur: r.utilisateur ? String(r.utilisateur) : undefined,
    createdAt: r.createdAt
      ? String(r.createdAt)
      : r.created_at
        ? String(r.created_at)
        : undefined,
  };
}

function loadLocalOperations(): TjkOperation[] {
  try {
    const raw = localStorage.getItem(TJK_OPERATIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalOperations(rows: TjkOperation[]): void {
  localStorage.setItem(TJK_OPERATIONS_STORAGE_KEY, JSON.stringify(rows));
}

export function formatTjkCamionLabel(
  op: Pick<TjkOperation, 'camionNom' | 'camionImmatriculation'>,
): string {
  const nom = op.camionNom?.trim();
  if (nom) return nom;
  const immat = op.camionImmatriculation?.trim();
  if (immat) return immat;
  return '—';
}

export function formatTjkClientLabel(
  op: Pick<TjkOperation, 'clientNom' | 'clientId'>,
): string {
  const nom = op.clientNom?.trim();
  if (nom) return nom;
  return '—';
}

let _cache: TjkOperation[] = [];
let _useApi = isRemoteTjkOperations();

export function getTjkOperationsCache(): TjkOperation[] {
  return [..._cache];
}

export async function refreshTjkOperationsFromApi(): Promise<TjkOperation[]> {
  if (!isRemoteTjkOperations()) {
    _useApi = false;
    _cache = loadLocalOperations();
    return [..._cache];
  }
  try {
    const rows = await tjkOperationsApi.getAll();
    _useApi = true;
    _cache = Array.isArray(rows)
      ? rows.map((r) => normalizeTjkOperation(r as Record<string, unknown>))
      : [];
    return [..._cache];
  } catch {
    _useApi = false;
    _cache = loadLocalOperations();
    return [..._cache];
  }
}

export async function createTjkOperation(
  payload: TjkOperationPayload,
): Promise<TjkOperation> {
  if (_useApi && isRemoteTjkOperations()) {
    try {
      const row = await tjkOperationsApi.create(payload);
      await refreshTjkOperationsFromApi();
      return normalizeTjkOperation(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }

  const created: TjkOperation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: payload.date,
    clientId: payload.clientId || undefined,
    clientNom: payload.clientNom?.trim() || undefined,
    quantite: payload.quantite,
    unite: payload.unite?.trim() || undefined,
    qualite: payload.qualite?.trim() || undefined,
    destination: payload.destination?.trim() || undefined,
    camionNom: payload.camionNom?.trim() || undefined,
    camionImmatriculation: payload.camionImmatriculation
      ? String(payload.camionImmatriculation).replace(/\s+/g, '').toUpperCase()
      : undefined,
    referenceAtc: payload.referenceAtc?.trim() || undefined,
    supplierLoadingId: payload.supplierLoadingId || undefined,
    notes: payload.notes?.trim() || undefined,
    utilisateur: payload.utilisateur?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const next = [created, ...loadLocalOperations()];
  saveLocalOperations(next);
  _cache = next;
  return created;
}

export async function updateTjkOperation(
  id: string,
  payload: Partial<TjkOperationPayload>,
): Promise<TjkOperation> {
  if (_useApi && isRemoteTjkOperations()) {
    try {
      const row = await tjkOperationsApi.update(id, payload);
      await refreshTjkOperationsFromApi();
      return normalizeTjkOperation(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }

  const local = loadLocalOperations();
  const idx = local.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error('Opération introuvable.');
  const prev = local[idx];
  const updated: TjkOperation = {
    ...prev,
    date: payload.date ?? prev.date,
    clientId:
      payload.clientId !== undefined ? payload.clientId || undefined : prev.clientId,
    clientNom:
      payload.clientNom !== undefined
        ? payload.clientNom?.trim() || undefined
        : prev.clientNom,
    quantite: payload.quantite !== undefined ? payload.quantite : prev.quantite,
    unite:
      payload.unite !== undefined ? payload.unite?.trim() || undefined : prev.unite,
    qualite:
      payload.qualite !== undefined
        ? payload.qualite?.trim() || undefined
        : prev.qualite,
    destination:
      payload.destination !== undefined
        ? payload.destination?.trim() || undefined
        : prev.destination,
    camionNom:
      payload.camionNom !== undefined
        ? payload.camionNom?.trim() || undefined
        : prev.camionNom,
    camionImmatriculation:
      payload.camionImmatriculation !== undefined
        ? payload.camionImmatriculation
          ? String(payload.camionImmatriculation).replace(/\s+/g, '').toUpperCase()
          : undefined
        : prev.camionImmatriculation,
    referenceAtc:
      payload.referenceAtc !== undefined
        ? payload.referenceAtc?.trim() || undefined
        : prev.referenceAtc,
    supplierLoadingId:
      payload.supplierLoadingId !== undefined
        ? payload.supplierLoadingId || undefined
        : prev.supplierLoadingId,
    notes:
      payload.notes !== undefined ? payload.notes?.trim() || undefined : prev.notes,
    utilisateur:
      payload.utilisateur !== undefined
        ? payload.utilisateur?.trim() || undefined
        : prev.utilisateur,
  };
  const next = [...local];
  next[idx] = updated;
  saveLocalOperations(next);
  _cache = next;
  return updated;
}

export async function deleteTjkOperation(id: string): Promise<void> {
  if (_useApi && isRemoteTjkOperations()) {
    try {
      await tjkOperationsApi.delete(id);
      await refreshTjkOperationsFromApi();
      return;
    } catch {
      _useApi = false;
    }
  }

  const next = loadLocalOperations().filter((m) => m.id !== id);
  saveLocalOperations(next);
  _cache = next;
}
