import type { AuditLogRow } from '@/lib/api';

export const MOVEMENT_MODULES = new Set([
  'bank',
  'caisse',
  'credits',
  'expenses',
  'invoices',
]);

export const MODULE_LABELS: Record<string, string> = {
  bank: 'Banque',
  caisse: 'Caisse',
  credits: 'Crédits',
  expenses: 'Dépenses',
  invoices: 'Factures',
  trips: 'Trajets',
  'client-orders': 'Commandes client',
  'client-deliveries': 'Livraisons',
  'supplier-loadings': 'Chargements',
  'third-parties': 'Tiers',
};

export const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  REMBOURSEMENT: 'Remboursement',
  PAYMENT: 'Paiement',
  ENCAISSEMENT: 'Encaissement',
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function isMovementModule(module: string): boolean {
  return MOVEMENT_MODULES.has(module);
}

/** Extrait un montant FCFA depuis afterData / beforeData (journal audit). */
export function extractAuditAmount(row: AuditLogRow): number | null {
  const data = row.afterData ?? row.beforeData;
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const keys = [
    'montant',
    'montantTTC',
    'montantHT',
    'montantPaye',
    'montantBon',
    'soldeInitial',
  ];
  for (const k of keys) {
    if (o[k] != null) {
      const n = Number(o[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  if (o.type === 'entree' || o.type === 'sortie') {
    const m = Number(o.montant);
    if (Number.isFinite(m)) return m;
  }
  return null;
}

export function formatAuditAmount(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('fr-FR')} FCFA`;
}
