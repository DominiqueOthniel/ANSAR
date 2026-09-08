/**
 * Registre opérations Camrail (wagons / chargements ferroviaires).
 */

import { camrailOperationsApi, type CamrailOperationPayload } from '@/lib/api';

export const CAMRAIL_OPERATIONS_STORAGE_KEY = 'camrail_operations';

export interface CamrailOperation {
  id: string;
  date: string;
  camionNom?: string;
  camionImmatriculation?: string;
  quantite: number;
  typeProduit?: string;
  referenceAtc?: string;
  atComplement?: number | null;
  destinataire?: string;
  dateChargement?: string;
  dateLivraison?: string;
  numeroWagon?: string;
  commentaires?: string;
  transporteur?: string;
  notes?: string;
  utilisateur?: string;
  createdAt?: string;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function parseOptionalNum(val: unknown): number | null | undefined {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseOptionalDate(val: unknown): string | undefined {
  if (val == null || val === '') return undefined;
  return String(val).split('T')[0];
}

export function isRemoteCamrailOperations(): boolean {
  return Boolean(import.meta.env.VITE_API_URL?.trim());
}

export function normalizeCamrailOperation(
  r: Record<string, unknown>,
): CamrailOperation {
  return {
    id: String(r.id),
    date: String(r.date).split('T')[0],
    camionNom: r.camionNom ? String(r.camionNom) : undefined,
    camionImmatriculation: r.camionImmatriculation
      ? String(r.camionImmatriculation)
      : undefined,
    quantite: parseNum(r.quantite),
    typeProduit: r.typeProduit ? String(r.typeProduit) : undefined,
    referenceAtc: r.referenceAtc ? String(r.referenceAtc) : undefined,
    atComplement: parseOptionalNum(r.atComplement),
    destinataire: r.destinataire ? String(r.destinataire) : undefined,
    dateChargement: parseOptionalDate(r.dateChargement),
    dateLivraison: parseOptionalDate(r.dateLivraison),
    numeroWagon: r.numeroWagon ? String(r.numeroWagon) : undefined,
    commentaires: r.commentaires ? String(r.commentaires) : undefined,
    transporteur: r.transporteur ? String(r.transporteur) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    utilisateur: r.utilisateur ? String(r.utilisateur) : undefined,
    createdAt: r.createdAt
      ? String(r.createdAt)
      : r.created_at
        ? String(r.created_at)
        : undefined,
  };
}

function loadLocalOperations(): CamrailOperation[] {
  try {
    const raw = localStorage.getItem(CAMRAIL_OPERATIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalOperations(rows: CamrailOperation[]): void {
  localStorage.setItem(CAMRAIL_OPERATIONS_STORAGE_KEY, JSON.stringify(rows));
}

export function formatCamrailCamionLabel(
  op: Pick<CamrailOperation, 'camionNom' | 'camionImmatriculation'>,
): string {
  const nom = op.camionNom?.trim();
  if (nom) return nom;
  const immat = op.camionImmatriculation?.trim();
  if (immat) return immat;
  return '—';
}

let _cache: CamrailOperation[] = [];
let _useApi = isRemoteCamrailOperations();

export function getCamrailOperationsCache(): CamrailOperation[] {
  return [..._cache];
}

export async function refreshCamrailOperationsFromApi(): Promise<CamrailOperation[]> {
  if (!isRemoteCamrailOperations()) {
    _useApi = false;
    _cache = loadLocalOperations();
    return [..._cache];
  }
  try {
    const rows = await camrailOperationsApi.getAll();
    _useApi = true;
    _cache = Array.isArray(rows)
      ? rows.map((r) => normalizeCamrailOperation(r as Record<string, unknown>))
      : [];
    return [..._cache];
  } catch {
    _useApi = false;
    _cache = loadLocalOperations();
    return [..._cache];
  }
}

export async function createCamrailOperation(
  payload: CamrailOperationPayload,
): Promise<CamrailOperation> {
  if (_useApi && isRemoteCamrailOperations()) {
    try {
      const row = await camrailOperationsApi.create(payload);
      await refreshCamrailOperationsFromApi();
      return normalizeCamrailOperation(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }

  const created: CamrailOperation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: payload.date,
    camionNom: payload.camionNom?.trim()?.toUpperCase() || undefined,
    camionImmatriculation: payload.camionImmatriculation
      ? String(payload.camionImmatriculation).replace(/\s+/g, '').toUpperCase()
      : undefined,
    quantite: payload.quantite,
    typeProduit: payload.typeProduit?.trim() || undefined,
    referenceAtc: payload.referenceAtc?.trim() || undefined,
    atComplement:
      payload.atComplement != null ? Number(payload.atComplement) : null,
    destinataire: payload.destinataire?.trim() || undefined,
    dateChargement: payload.dateChargement?.trim() || undefined,
    dateLivraison: payload.dateLivraison?.trim() || undefined,
    numeroWagon: payload.numeroWagon?.trim() || undefined,
    commentaires: payload.commentaires?.trim() || undefined,
    transporteur: payload.transporteur?.trim() || undefined,
    notes: payload.notes?.trim() || undefined,
    utilisateur: payload.utilisateur?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const next = [created, ...loadLocalOperations()];
  saveLocalOperations(next);
  _cache = next;
  return created;
}

export async function updateCamrailOperation(
  id: string,
  payload: Partial<CamrailOperationPayload>,
): Promise<CamrailOperation> {
  if (_useApi && isRemoteCamrailOperations()) {
    try {
      const row = await camrailOperationsApi.update(id, payload);
      await refreshCamrailOperationsFromApi();
      return normalizeCamrailOperation(row as Record<string, unknown>);
    } catch {
      _useApi = false;
    }
  }

  const local = loadLocalOperations();
  const idx = local.findIndex((m) => m.id === id);
  if (idx < 0) throw new Error('Opération introuvable.');
  const prev = local[idx];
  const updated: CamrailOperation = {
    ...prev,
    date: payload.date ?? prev.date,
    camionNom:
      payload.camionNom !== undefined
        ? payload.camionNom?.trim()?.toUpperCase() || undefined
        : prev.camionNom,
    camionImmatriculation:
      payload.camionImmatriculation !== undefined
        ? payload.camionImmatriculation
          ? String(payload.camionImmatriculation).replace(/\s+/g, '').toUpperCase()
          : undefined
        : prev.camionImmatriculation,
    quantite: payload.quantite !== undefined ? payload.quantite : prev.quantite,
    typeProduit:
      payload.typeProduit !== undefined
        ? payload.typeProduit?.trim() || undefined
        : prev.typeProduit,
    referenceAtc:
      payload.referenceAtc !== undefined
        ? payload.referenceAtc?.trim() || undefined
        : prev.referenceAtc,
    atComplement:
      payload.atComplement !== undefined
        ? payload.atComplement == null
          ? null
          : Number(payload.atComplement)
        : prev.atComplement,
    destinataire:
      payload.destinataire !== undefined
        ? payload.destinataire?.trim() || undefined
        : prev.destinataire,
    dateChargement:
      payload.dateChargement !== undefined
        ? payload.dateChargement?.trim() || undefined
        : prev.dateChargement,
    dateLivraison:
      payload.dateLivraison !== undefined
        ? payload.dateLivraison?.trim() || undefined
        : prev.dateLivraison,
    numeroWagon:
      payload.numeroWagon !== undefined
        ? payload.numeroWagon?.trim() || undefined
        : prev.numeroWagon,
    commentaires:
      payload.commentaires !== undefined
        ? payload.commentaires?.trim() || undefined
        : prev.commentaires,
    transporteur:
      payload.transporteur !== undefined
        ? payload.transporteur?.trim() || undefined
        : prev.transporteur,
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

export async function deleteCamrailOperation(id: string): Promise<void> {
  if (_useApi && isRemoteCamrailOperations()) {
    try {
      await camrailOperationsApi.delete(id);
      await refreshCamrailOperationsFromApi();
      return;
    } catch {
      _useApi = false;
    }
  }

  const next = loadLocalOperations().filter((m) => m.id !== id);
  saveLocalOperations(next);
  _cache = next;
}
