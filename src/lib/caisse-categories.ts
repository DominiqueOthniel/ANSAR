/**
 * Cas de dépenses (catégories de sortie caisse) configurables.
 * Liste par défaut + ajouts utilisateur (localStorage ou caisse_config API).
 */

import { caisseApi } from '@/lib/api';
import { frCollator } from '@/lib/list-sort';

export const CAISSE_CATEGORIES_STORAGE_KEY = 'caisse_categories_depense';

/** Liste initiale proposée ; l’utilisateur peut en ajouter d’autres. */
export const DEFAULT_SORTIE_CATEGORIES = [
  'Carburant',
  'Maintenance',
  'Péage',
  'Assurance',
  'Salaire',
  'Don',
  'Dépense du PDG',
  'Dépense du bureau',
  'Transport',
  'Replicat',
  'Avance transport',
  'Achat',
  'Prime',
  'Retrait',
  'Autre',
] as const;

function isRemoteCaisseCategories(): boolean {
  return Boolean(import.meta.env.VITE_API_URL?.trim());
}

function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function normalizeCaisseCategories(input: unknown): string[] {
  const source = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? (() => {
          try {
            return JSON.parse(input) as unknown;
          } catch {
            return [];
          }
        })()
      : [];

  if (!Array.isArray(source)) return [...DEFAULT_SORTIE_CATEGORIES];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of source) {
    if (typeof item !== 'string') continue;
    const label = normalizeLabel(item);
    if (!label) continue;
    const key = label.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.length > 0 ? out : [...DEFAULT_SORTIE_CATEGORIES];
}

function loadLocalCategories(): string[] {
  try {
    const raw = localStorage.getItem(CAISSE_CATEGORIES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_SORTIE_CATEGORIES];
    return normalizeCaisseCategories(JSON.parse(raw));
  } catch {
    return [...DEFAULT_SORTIE_CATEGORIES];
  }
}

function saveLocalCategories(categories: string[]): void {
  localStorage.setItem(CAISSE_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
}

let _categoriesCache: string[] | null = null;

export function getCaisseCategoriesSync(): string[] {
  if (isRemoteCaisseCategories() && _categoriesCache) return [..._categoriesCache];
  if (isRemoteCaisseCategories() && !_categoriesCache) {
    return [...DEFAULT_SORTIE_CATEGORIES];
  }
  return loadLocalCategories();
}

/** Appelé après refresh config API. */
export function setCaisseCategoriesCache(categories: unknown): string[] {
  _categoriesCache = normalizeCaisseCategories(categories);
  return [..._categoriesCache];
}

export async function persistCaisseCategories(categories: string[]): Promise<string[]> {
  const next = normalizeCaisseCategories(categories);
  if (isRemoteCaisseCategories()) {
    const current = await caisseApi.getConfig();
    const cfg = await caisseApi.updateConfig({
      soldeInitial: current.soldeInitial,
      categoriesDepense: next,
    });
    return setCaisseCategoriesCache(cfg.categoriesDepense ?? next);
  }
  saveLocalCategories(next);
  _categoriesCache = next;
  return [...next];
}

export async function addCaisseCategory(label: string): Promise<string[]> {
  const normalized = normalizeLabel(label);
  if (!normalized) throw new Error('Indique un nom de cas de dépense.');
  const current = getCaisseCategoriesSync();
  const exists = current.some(
    (c) => c.toLocaleLowerCase('fr') === normalized.toLocaleLowerCase('fr'),
  );
  if (exists) throw new Error(`« ${normalized} » existe déjà.`);
  return persistCaisseCategories([...current, normalized]);
}

export async function removeCaisseCategory(label: string): Promise<string[]> {
  const key = normalizeLabel(label).toLocaleLowerCase('fr');
  const next = getCaisseCategoriesSync().filter((c) => c.toLocaleLowerCase('fr') !== key);
  if (next.length === 0) {
    throw new Error('Il doit rester au moins un cas de dépense.');
  }
  return persistCaisseCategories(next);
}

export function mergeCaisseCategoriesWithUsed(
  managed: string[],
  usedInTransactions: Array<string | undefined | null>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...managed, ...usedInTransactions]) {
    const label = typeof c === 'string' ? normalizeLabel(c) : '';
    if (!label) continue;
    const key = label.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.sort((a, b) => frCollator.compare(a, b));
}
