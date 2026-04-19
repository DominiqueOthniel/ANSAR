/**
 * Client API pour Truck Track
 * Communique avec le backend NestJS (préfixe global `/api` sur le serveur).
 */

/**
 * URL de base incluant `/api`. Si VITE_API_URL est `https://host` sans `/api`,
 * on l’ajoute — sinon les appels partent vers `/caisse/...` et le serveur répond
 * « Cannot GET /caisse/... » (404).
 */
function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL || 'http://localhost:3000').trim();
  const base = raw.replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API_URL = getApiBaseUrl();

/** Contexte utilisateur courant pour le journal d’audit côté API (en-têtes x-actor-*). */
let apiActor: { login?: string; role?: string } | null = null;

export function setApiActor(actor: { login?: string; role?: string } | null): void {
  apiActor = actor;
}

function buildQuery(params?: Record<string, string | number | undefined> | null): string {
  const q = new URLSearchParams();
  if (params == null) return '';
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface AuditLogRow {
  id: string;
  module: string;
  action: string;
  entityId?: string;
  actorLogin?: string;
  actorRole?: string;
  summary?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  createdAt: string;
}

export const auditLogsApi = {
  getAll: (params?: {
    module?: string;
    action?: string;
    actorLogin?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) => request<AuditLogRow[]>(`/audit-logs${buildQuery(params)}`),
};

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const actorHeaders: Record<string, string> = {};
  if (apiActor?.login) actorHeaders['x-actor-login'] = apiActor.login;
  if (apiActor?.role) actorHeaders['x-actor-role'] = apiActor.role;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...actorHeaders,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Erreur ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Types (ré-export pour cohérence)
export interface TruckPayload {
  immatriculation: string;
  modele: string;
  type: 'tracteur' | 'remorqueuse';
  statut: 'actif' | 'inactif';
  dateMiseEnCirculation: string;
  photo?: string;
  proprietaireId?: string;
  chauffeurId?: string;
}

export interface TripPayload {
  tracteurId?: string;
  remorqueuseId?: string;
  origine: string;
  destination: string;
  origineLat?: number;
  origineLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  chauffeurId: string;
  dateDepart: string;
  dateArrivee?: string;
  recette: number;
  prefinancement?: number;
  client?: string;
  marchandise?: string;
  description?: string;
  statut: 'planifie' | 'en_cours' | 'termine' | 'annule';
}

export interface ExpensePayload {
  camionId?: string | null;
  tripId?: string;
  chauffeurId?: string;
  categorie: string;
  sousCategorie?: string;
  fournisseurId?: string;
  montant: number;
  quantite?: number;
  prixUnitaire?: number;
  date: string;
  description: string;
}

export interface InvoicePayload {
  numero: string;
  trajetId?: string;
  parcelExpeditionId?: string;
  expenseId?: string;
  statut: 'en_attente' | 'payee';
  montantHT: number;
  remise?: number;
  montantHTApresRemise?: number;
  tva?: number;
  tps?: number;
  montantTTC: number;
  montantPaye?: number;
  dateCreation: string;
  datePaiement?: string;
  modePaiement?: string;
  notes?: string;
}

export interface DriverPayload {
  nom: string;
  prenom: string;
  telephone: string;
  cni?: string;
  photo?: string;
  transactions?: Array<{ type: 'apport' | 'sortie'; montant: number; date: string; description: string }>;
}

export interface ThirdPartyPayload {
  nom: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  type: 'proprietaire' | 'client' | 'fournisseur';
  notes?: string;
}

export interface BankAccountPayload {
  nom: string;
  numeroCompte: string;
  banque: string;
  type: 'courant' | 'epargne' | 'professionnel';
  soldeInitial: number;
  devise?: string;
  iban?: string;
  swift?: string;
  notes?: string;
}

export interface BankTransactionPayload {
  compteId: string;
  type: 'depot' | 'retrait' | 'virement' | 'prelevement' | 'frais';
  montant: number;
  date: string;
  description: string;
  reference?: string;
  beneficiaire?: string;
  categorie?: string;
}

// --- Trucks ---
export const trucksApi = {
  getAll: () => request<any[]>('/trucks'),
  getOne: (id: string) => request<any>(`/trucks/${id}`),
  create: (data: TruckPayload) => request<any>('/trucks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TruckPayload>) => request<any>(`/trucks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/trucks/${id}`, { method: 'DELETE' }),
};

// --- Drivers ---
export const driversApi = {
  getAll: () => request<any[]>('/drivers'),
  getOne: (id: string) => request<any>(`/drivers/${id}`),
  create: (data: DriverPayload) => request<any>('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<DriverPayload>) => request<any>(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/drivers/${id}`, { method: 'DELETE' }),
};

// --- Trips ---
export const tripsApi = {
  getAll: () => request<any[]>('/trips'),
  getOne: (id: string) => request<any>(`/trips/${id}`),
  create: (data: TripPayload) => request<any>('/trips', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<TripPayload>) => request<any>(`/trips/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/trips/${id}`, { method: 'DELETE' }),
};

export interface ParcelExpeditionLotPayload {
  id?: string;
  clients: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  montant?: number;
  observations?: string;
}

export interface ParcelExpeditionPayload {
  reference: string;
  origine: string;
  origineLat?: number;
  origineLng?: number;
  destination: string;
  destinationLat?: number;
  destinationLng?: number;
  tracteurId?: string;
  remorqueuseId?: string;
  chauffeurId: string;
  dateDepart: string;
  dateArrivee?: string;
  statut: TripPayload['statut'];
  lots: ParcelExpeditionLotPayload[];
  description?: string;
  /** Commission société sur le CA des lignes (0–100 %). */
  commissionPct?: number;
  dateCreation?: string;
}

export type ParcelExpeditionQueryParams = {
  statut?: TripPayload['statut'];
  destination?: string;
  chauffeurId?: string;
  tracteurId?: string;
  remorqueuseId?: string;
  q?: string;
  dateDepartFrom?: string;
  dateDepartTo?: string;
};

// --- Expéditions colis (Douala → …, multi-lots) ---
export const parcelExpeditionsApi = {
  getAll: (params?: ParcelExpeditionQueryParams) =>
    request<any[]>(`/parcel-expeditions${buildQuery(params as Record<string, string | number | undefined>)}`),
  getOne: (id: string) => request<any>(`/parcel-expeditions/${id}`),
  create: (data: ParcelExpeditionPayload) =>
    request<any>('/parcel-expeditions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ParcelExpeditionPayload>) =>
    request<any>(`/parcel-expeditions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/parcel-expeditions/${id}`, { method: 'DELETE' }),
};

// --- Expenses ---
export const expensesApi = {
  getAll: () => request<any[]>('/expenses'),
  getOne: (id: string) => request<any>(`/expenses/${id}`),
  create: (data: ExpensePayload) => request<any>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ExpensePayload>) => request<any>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/expenses/${id}`, { method: 'DELETE' }),
};

// --- Invoices ---
export const invoicesApi = {
  getAll: () => request<any[]>('/invoices'),
  getOne: (id: string) => request<any>(`/invoices/${id}`),
  create: (data: InvoicePayload) => request<any>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<InvoicePayload>) => request<any>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/invoices/${id}`, { method: 'DELETE' }),
};

// --- Third Parties ---
export const thirdPartiesApi = {
  getAll: () => request<any[]>('/third-parties'),
  getOne: (id: string) => request<any>(`/third-parties/${id}`),
  create: (data: ThirdPartyPayload) => request<any>('/third-parties', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ThirdPartyPayload>) => request<any>(`/third-parties/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/third-parties/${id}`, { method: 'DELETE' }),
};

// --- Admin ---
export const adminApi = {
  purge: () => request<{ message: string }>('/admin/purge', { method: 'DELETE' }),
  backup: () => fetch(`${API_URL}/admin/backup`),
  restore: (data: object) => request<{ message: string; counts: Record<string, number> }>('/admin/restore', {
    method: 'POST',
    body: JSON.stringify({ data }),
  }),
};

// --- Bank ---
export const bankApi = {
  getAccounts: () => request<any[]>('/bank/accounts'),
  getAccount: (id: string) => request<any>(`/bank/accounts/${id}`),
  createAccount: (data: BankAccountPayload) => request<any>('/bank/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: string, data: Partial<BankAccountPayload>) => request<any>(`/bank/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccount: (id: string) => request<void>(`/bank/accounts/${id}`, { method: 'DELETE' }),
  getTransactions: () => request<any[]>('/bank/transactions'),
  createTransaction: (data: BankTransactionPayload) => request<any>('/bank/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: Partial<BankTransactionPayload>) => request<any>(`/bank/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTransaction: (id: string) => request<void>(`/bank/transactions/${id}`, { method: 'DELETE' }),
};

// --- Caisse (Supabase via API Nest) ---
export interface CaisseTransactionPayload {
  id?: string;
  type: 'entree' | 'sortie';
  montant: number;
  date: string;
  description: string;
  utilisateur?: string;
  categorie?: string;
  reference?: string;
  compteBanqueId?: string;
  bankTransactionId?: string;
  exclutRevenu?: boolean;
}

export const caisseApi = {
  getConfig: () => request<{ id: number; soldeInitial: number }>('/caisse/config'),
  updateConfig: (data: { soldeInitial: number }) =>
    request<{ id: number; soldeInitial: number }>('/caisse/config', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getBalance: () =>
    request<{ soldeInitial: number; soldeActuel: number }>('/caisse/balance'),
  getTransactions: () => request<Record<string, unknown>[]>('/caisse/transactions'),
  createTransaction: (data: CaisseTransactionPayload) =>
    request<Record<string, unknown>>('/caisse/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTransaction: (id: string, data: Partial<CaisseTransactionPayload>) =>
    request<Record<string, unknown>>(`/caisse/transactions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteTransaction: (id: string) =>
    request<void>(`/caisse/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  upsertByReference: (reference: string, data: CaisseTransactionPayload) =>
    request<Record<string, unknown>>(
      `/caisse/transactions/upsert-by-reference?reference=${encodeURIComponent(reference)}`,
      { method: 'POST', body: JSON.stringify({ ...data, reference }) },
    ),
  removeByReference: (reference: string) =>
    request<void>(
      `/caisse/transactions/by-reference?reference=${encodeURIComponent(reference)}`,
      { method: 'DELETE' },
    ),
};

// --- Crédits (Supabase via API Nest) ---
export interface CreditPayload {
  type: 'emprunt' | 'pret_accorde';
  intitule: string;
  preteur: string;
  montantTotal: number;
  tauxInteret?: number;
  dateDebut: string;
  dateEcheance?: string;
  notes?: string;
}

export interface RemboursementPayload {
  date: string;
  montant: number;
  note?: string;
}

export const creditsApi = {
  getAll: () => request<Record<string, unknown>[]>('/credits'),
  getOne: (id: string) => request<Record<string, unknown>>(`/credits/${id}`),
  create: (data: CreditPayload) =>
    request<Record<string, unknown>>('/credits', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreditPayload & { montantRembourse?: number; statut?: string }>) =>
    request<Record<string, unknown>>(`/credits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/credits/${id}`, { method: 'DELETE' }),
  addRemboursement: (creditId: string, data: RemboursementPayload) =>
    request<Record<string, unknown>>(`/credits/${creditId}/remboursements`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
