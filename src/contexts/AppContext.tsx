import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  trucksApi,
  driversApi,
  tripsApi,
  parcelExpeditionsApi,
  expensesApi,
  invoicesApi,
  thirdPartiesApi,
  merchandiseQualitiesApi,
} from '@/lib/api';
import type { ParcelExpeditionPayload } from '@/lib/api';
import type { TripClientParticipant } from '@/lib/trip-client-participants';
import { normalizeInvoicePaymentSlices, type InvoicePaymentEncaissement } from '@/lib/invoice-payment-slices';
import { refreshCaisseFromApi, isRemoteCaisse } from '@/lib/caisse-local';
import { refreshBankFromApi } from '@/lib/bank-local';

// Types
export type TruckType = 'tracteur' | 'remorqueuse';
export type TruckStatus = 'actif' | 'inactif';
export type TruckSousType = 'tracteur_seul' | 'tracteur_jumele' | 'remorque_seule';

export interface Truck {
  id: string;
  immatriculation: string;
  modele: string;
  type: TruckType;
  sousType?: TruckSousType;
  remorqueImmatriculation?: string;
  statut: TruckStatus;
  dateMiseEnCirculation: string;
  photo?: string;
  proprietaireId?: string;
  chauffeurId?: string;
}

export type TripStatus = 'planifie' | 'en_cours' | 'termine' | 'annule';

export type TripStopType = 'chargement' | 'livraison' | 'autre';
export type TripStopStatut = 'prevu' | 'fait' | 'annule';

export interface TripStop {
  id: string;
  ordre: number;
  type: TripStopType;
  lieu: string;
  clientRef?: string;
  lat?: number;
  lng?: number;
  statut: TripStopStatut;
  notes?: string;
}

export type { TripClientParticipant } from '@/lib/trip-client-participants';
export type { InvoicePaymentEncaissement } from '@/lib/invoice-payment-slices';

export interface Trip {
  id: string;
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
  dateArrivee: string;
  recette: number;
  prefinancement?: number;
  client?: string;
  marchandise?: string;
  description?: string;
  referenceAtc?: string;
  destinataire?: string;
  quantiteChargee?: number;
  retourBordereaux?: string;
  statut: TripStatus;
  /** Arrêts : chargements chez les fournisseurs, livraisons chez les clients (optionnel côté API). */
  stops?: TripStop[];
  /** Clients / parts liés au trajet (multi-clients, règlement). */
  clientParticipants?: TripClientParticipant[];
  /** `id` d’une entrée de `clientParticipants` : payeur au règlement / défaut facture. */
  payeurParticipantId?: string;
}

export interface ParcelExpeditionLot {
  id: string;
  clients: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  observations?: string;
}

export interface ParcelExpedition {
  id: string;
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
  dateArrivee: string;
  statut: TripStatus;
  lots: ParcelExpeditionLot[];
  description?: string;
  /** Commission sur le CA des lignes (%), optionnel. */
  commissionPct?: number;
  dateCreation: string;
}

export interface Expense {
  id: string;
  camionId?: string;
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

export type InvoiceStatus = 'en_attente' | 'payee';

export interface Invoice {
  id: string;
  numero: string;
  trajetId?: string;
  parcelExpeditionId?: string;
  expenseId?: string;
  statut: InvoiceStatus;
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
  /** Fiche client (facture partielle trajet, multi-clients). */
  clientTierId?: string;
  factureClientLibelle?: string;
  /** Ventilation des encaissements par payeur (même facture, plusieurs clients). */
  paiementsEncaissements?: InvoicePaymentEncaissement[];
}

export interface DriverTransaction {
  id: string;
  type: 'apport' | 'sortie';
  montant: number;
  date: string;
  description: string;
}

export interface Driver {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  cni?: string;
  numeroPermis?: string;
  photo?: string;
  transactions: DriverTransaction[];
}

export type ThirdPartyType = 'proprietaire' | 'client' | 'fournisseur' | 'employe';

export interface ThirdParty {
  id: string;
  nom: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  type: ThirdPartyType;
  notes?: string;
  /** Encours max. commandes clients sans paiement (FCFA), fiches client uniquement. */
  plafondCredit?: number;
}

/** Libellé enregistré pour le champ marchandise / qualité des trajets. */
export interface MerchandiseQuality {
  id: string;
  libelle: string;
  createdAt?: string;
}

// Normalisation des données API (TypeORM renvoie les décimaux en string)
function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function normalizeTruck(r: Record<string, unknown>): Truck {
  return {
    id: String(r.id),
    immatriculation: String(r.immatriculation),
    modele: String(r.modele),
    type: r.type as TruckType,
    sousType: r.sousType ? (String(r.sousType) as TruckSousType) : undefined,
    remorqueImmatriculation: r.remorqueImmatriculation
      ? String(r.remorqueImmatriculation)
      : undefined,
    statut: r.statut as TruckStatus,
    dateMiseEnCirculation: String(r.dateMiseEnCirculation),
    photo: r.photo ? String(r.photo) : undefined,
    proprietaireId: r.proprietaireId ? String(r.proprietaireId) : undefined,
    chauffeurId: r.chauffeurId ? String(r.chauffeurId) : undefined,
  };
}

function roundMontantFcfa(q: number, pu: number): number {
  const n = q * pu;
  return Math.round(Number.isFinite(n) ? n : 0);
}

function normalizeParcelLot(row: Record<string, unknown>): ParcelExpeditionLot {
  const id = String(row.id ?? '');
  const isNew =
    'clients' in row && 'unite' in row && 'quantite' in row && 'prixUnitaire' in row;
  if (isNew) {
    const quantite = parseNum(row.quantite);
    const prixUnitaire = parseNum(row.prixUnitaire);
    return {
      id,
      clients: String(row.clients ?? ''),
      unite: String(row.unite ?? ''),
      quantite,
      prixUnitaire,
      montant: roundMontantFcfa(quantite, prixUnitaire),
      observations: row.observations ? String(row.observations) : undefined,
    };
  }
  const entreprise = String(row.entreprise ?? '');
  const marchandise = String(row.marchandise ?? '');
  const poids = parseNum(row.poidsKg);
  const notes = row.notes ? String(row.notes) : '';
  const legacyObs = [
    marchandise ? `Ancienne marchandise : ${marchandise}` : '',
    poids > 0 ? `Poids : ${poids} kg` : '',
    notes,
  ]
    .filter(Boolean)
    .join(' — ');
  return {
    id,
    clients: entreprise,
    unite: 'lot',
    quantite: 1,
    prixUnitaire: 0,
    montant: 0,
    observations: legacyObs || undefined,
  };
}

function normalizeTripStops(raw: unknown): TripStop[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: TripStop[] = [];
  let i = 0;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const lieu = String(r.lieu ?? '').trim();
    if (!lieu) continue;
    const id =
      r.id != null && String(r.id).length > 0
        ? String(r.id)
        : `stop-${i}-${Date.now()}`;
    const typeStr = String(r.type ?? 'autre');
    const type: TripStopType =
      typeStr === 'chargement' || typeStr === 'livraison' || typeStr === 'autre'
        ? typeStr
        : 'autre';
    const statutStr = String(r.statut ?? 'prevu');
    const statut: TripStopStatut =
      statutStr === 'prevu' || statutStr === 'fait' || statutStr === 'annule'
        ? statutStr
        : 'prevu';
    out.push({
      id,
      ordre: typeof r.ordre === 'number' ? r.ordre : parseNum(r.ordre) || i,
      type,
      lieu,
      clientRef: r.clientRef != null ? String(r.clientRef) : undefined,
      lat: r.lat != null ? parseNum(r.lat) : undefined,
      lng: r.lng != null ? parseNum(r.lng) : undefined,
      statut,
      notes: r.notes != null ? String(r.notes) : undefined,
    });
    i += 1;
  }
  if (out.length === 0) return undefined;
  return out.map((s, idx) => ({ ...s, ordre: idx }));
}

function normalizeTrip(r: Record<string, unknown>): Trip {
  return {
    id: String(r.id),
    tracteurId: r.tracteurId ? String(r.tracteurId) : undefined,
    remorqueuseId: r.remorqueuseId ? String(r.remorqueuseId) : undefined,
    origine: String(r.origine),
    destination: String(r.destination),
    origineLat: r.origineLat != null ? parseNum(r.origineLat) : undefined,
    origineLng: r.origineLng != null ? parseNum(r.origineLng) : undefined,
    destinationLat: r.destinationLat != null ? parseNum(r.destinationLat) : undefined,
    destinationLng: r.destinationLng != null ? parseNum(r.destinationLng) : undefined,
    chauffeurId: String(r.chauffeurId),
    dateDepart: String(r.dateDepart),
    dateArrivee: r.dateArrivee ? String(r.dateArrivee) : '',
    recette: parseNum(r.recette),
    prefinancement: r.prefinancement != null ? parseNum(r.prefinancement) : undefined,
    client: r.client ? String(r.client) : undefined,
    marchandise: r.marchandise ? String(r.marchandise) : undefined,
    description: r.description ? String(r.description) : undefined,
    referenceAtc: r.referenceAtc ? String(r.referenceAtc) : undefined,
    destinataire: r.destinataire ? String(r.destinataire) : undefined,
    quantiteChargee:
      r.quantiteChargee != null && String(r.quantiteChargee) !== ''
        ? parseNum(r.quantiteChargee)
        : undefined,
    retourBordereaux: r.retourBordereaux ? String(r.retourBordereaux) : undefined,
    statut: r.statut as TripStatus,
    stops: normalizeTripStops(r.stops),
  };
}

function normalizeParcelExpedition(r: Record<string, unknown>): ParcelExpedition {
  const chauffeurId =
    r.chauffeurId != null && String(r.chauffeurId) !== ''
      ? String(r.chauffeurId)
      : (r.chauffeur as Record<string, unknown> | undefined)?.id != null
        ? String((r.chauffeur as Record<string, unknown>).id)
        : '';
  const lotsRaw = r.lots;
  const lots: ParcelExpeditionLot[] = Array.isArray(lotsRaw)
    ? (lotsRaw as Record<string, unknown>[]).map((row) => normalizeParcelLot(row))
    : [];
  const dateDepart = String(r.dateDepart ?? '');
  const dateArrivee = r.dateArrivee != null && String(r.dateArrivee) !== '' ? String(r.dateArrivee) : '';
  const dateCreation = String(r.dateCreation ?? '');
  return {
    id: String(r.id),
    reference: String(r.reference ?? ''),
    origine: String(r.origine ?? ''),
    origineLat: r.origineLat != null ? parseNum(r.origineLat) : undefined,
    origineLng: r.origineLng != null ? parseNum(r.origineLng) : undefined,
    destination: String(r.destination ?? ''),
    destinationLat: r.destinationLat != null ? parseNum(r.destinationLat) : undefined,
    destinationLng: r.destinationLng != null ? parseNum(r.destinationLng) : undefined,
    tracteurId: r.tracteurId ? String(r.tracteurId) : undefined,
    remorqueuseId: r.remorqueuseId ? String(r.remorqueuseId) : undefined,
    chauffeurId,
    dateDepart: dateDepart.includes('T') ? dateDepart.split('T')[0] : dateDepart,
    dateArrivee: dateArrivee.includes('T') ? dateArrivee.split('T')[0] : dateArrivee,
    statut: r.statut as TripStatus,
    lots,
    description: r.description ? String(r.description) : undefined,
    commissionPct:
      r.commissionPct != null && String(r.commissionPct) !== ''
        ? parseNum(r.commissionPct)
        : undefined,
    dateCreation: dateCreation.includes('T') ? dateCreation.split('T')[0] : dateCreation,
  };
}

function normalizeExpense(r: Record<string, unknown>): Expense {
  return {
    id: String(r.id),
    camionId: r.camionId != null && String(r.camionId) !== '' ? String(r.camionId) : undefined,
    tripId: r.tripId ? String(r.tripId) : undefined,
    chauffeurId: r.chauffeurId ? String(r.chauffeurId) : undefined,
    categorie: String(r.categorie),
    sousCategorie: r.sousCategorie ? String(r.sousCategorie) : undefined,
    fournisseurId: r.fournisseurId ? String(r.fournisseurId) : undefined,
    montant: parseNum(r.montant),
    quantite: r.quantite != null ? parseNum(r.quantite) : undefined,
    prixUnitaire: r.prixUnitaire != null ? parseNum(r.prixUnitaire) : undefined,
    date: String(r.date),
    description: String(r.description),
  };
}

function normalizeInvoice(r: Record<string, unknown>): Invoice {
  return {
    id: String(r.id),
    numero: String(r.numero),
    trajetId: r.trajetId ? String(r.trajetId) : undefined,
    parcelExpeditionId: r.parcelExpeditionId ? String(r.parcelExpeditionId) : undefined,
    expenseId: r.expenseId ? String(r.expenseId) : undefined,
    statut: r.statut as InvoiceStatus,
    montantHT: parseNum(r.montantHT),
    remise: r.remise != null ? parseNum(r.remise) : undefined,
    montantHTApresRemise: r.montantHTApresRemise != null ? parseNum(r.montantHTApresRemise) : undefined,
    tva: r.tva != null ? parseNum(r.tva) : undefined,
    tps: r.tps != null ? parseNum(r.tps) : undefined,
    montantTTC: parseNum(r.montantTTC),
    montantPaye: r.montantPaye != null ? parseNum(r.montantPaye) : undefined,
    dateCreation: String(r.dateCreation),
    datePaiement: r.datePaiement ? String(r.datePaiement) : undefined,
    modePaiement: r.modePaiement ? String(r.modePaiement) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    clientTierId:
      r.clientTierId != null && String(r.clientTierId) !== '' ? String(r.clientTierId) : undefined,
    factureClientLibelle:
      r.factureClientLibelle != null && String(r.factureClientLibelle) !== ''
        ? String(r.factureClientLibelle)
        : undefined,
    paiementsEncaissements: (() => {
      const slices = normalizeInvoicePaymentSlices(r.paiementsEncaissements);
      return slices.length > 0 ? slices : undefined;
    })(),
  };
}

function normalizeDriver(r: Record<string, unknown>): Driver {
  const transactions = Array.isArray(r.transactions)
    ? r.transactions.map((t: Record<string, unknown>) => ({
        id: String(t.id),
        type: t.type as 'apport' | 'sortie',
        montant: parseNum(t.montant),
        date: String(t.date),
        description: String(t.description),
      }))
    : [];
  return {
    id: String(r.id),
    nom: String(r.nom),
    prenom: String(r.prenom),
    telephone: String(r.telephone),
    cni: r.cni ? String(r.cni) : undefined,
    numeroPermis: r.numeroPermis ? String(r.numeroPermis) : undefined,
    photo: r.photo ? String(r.photo) : undefined,
    transactions,
  };
}

function normalizeThirdParty(r: Record<string, unknown>): ThirdParty {
  return {
    id: String(r.id),
    nom: String(r.nom),
    telephone: r.telephone ? String(r.telephone) : undefined,
    email: r.email ? String(r.email) : undefined,
    adresse: r.adresse ? String(r.adresse) : undefined,
    type: r.type as ThirdPartyType,
    notes: r.notes ? String(r.notes) : undefined,
    plafondCredit:
      r.plafondCredit != null && String(r.plafondCredit) !== ''
        ? parseNum(r.plafondCredit)
        : undefined,
  };
}

function normalizeMerchandiseQuality(r: Record<string, unknown>): MerchandiseQuality {
  const createdRaw = r.createdAt ?? r.created_at;
  return {
    id: String(r.id),
    libelle: String(r.libelle ?? '').trim(),
    createdAt:
      createdRaw != null && String(createdRaw) !== '' ? String(createdRaw) : undefined,
  };
}

const initialSubCategories: Record<string, string[]> = {
  'Carburant': ['Diesel', 'Essence', 'AdBlue'],
  'Maintenance': ['Révision', 'Réparation', 'Pièces détachées', 'Vidange'],
  'Péage': ['Autoroute', 'Pont', 'Tunnel'],
  'Assurance': ['Assurance véhicule', 'Assurance responsabilité'],
  'Salaire': ['Salaire chauffeur', 'Salaire personnel siège', 'Avance salaire', 'Prime'],
  'Don': [],
};
const SUBCATEGORIES_STORAGE_KEY = 'truck_track_subcategories';

function getInitialSubCategories(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(SUBCATEGORIES_STORAGE_KEY);
    if (!raw) return initialSubCategories;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return initialSubCategories;
    const merged: Record<string, string[]> = { ...initialSubCategories };
    for (const [cat, subs] of Object.entries(parsed)) {
      if (Array.isArray(subs)) {
        merged[cat] = subs
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter((s) => s.length > 0);
      }
    }
    return merged;
  } catch {
    return initialSubCategories;
  }
}

interface AppContextType {
  trucks: Truck[];
  setTrucks: React.Dispatch<React.SetStateAction<Truck[]>>;
  trips: Trip[];
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  parcelExpeditions: ParcelExpedition[];
  setParcelExpeditions: React.Dispatch<React.SetStateAction<ParcelExpedition[]>>;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  drivers: Driver[];
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>;
  thirdParties: ThirdParty[];
  setThirdParties: React.Dispatch<React.SetStateAction<ThirdParty[]>>;
  merchandiseQualities: MerchandiseQuality[];
  setMerchandiseQualities: React.Dispatch<React.SetStateAction<MerchandiseQuality[]>>;
  subCategories: Record<string, string[]>;
  setSubCategories: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  isLoading: boolean;
  apiError: string | null;
  refreshTrucks: () => Promise<void>;
  refreshDrivers: () => Promise<void>;
  refreshTrips: () => Promise<void>;
  refreshParcelExpeditions: (params?: import('@/lib/api').ParcelExpeditionQueryParams) => Promise<void>;
  refreshExpenses: () => Promise<void>;
  refreshInvoices: () => Promise<void>;
  refreshThirdParties: () => Promise<void>;
  refreshMerchandiseQualities: () => Promise<void>;
  createTruck: (data: Parameters<typeof trucksApi.create>[0]) => Promise<Truck>;
  updateTruck: (id: string, data: Parameters<typeof trucksApi.update>[1]) => Promise<Truck>;
  deleteTruck: (id: string) => Promise<void>;
  createDriver: (data: Parameters<typeof driversApi.create>[0]) => Promise<Driver>;
  updateDriver: (id: string, data: Parameters<typeof driversApi.update>[1]) => Promise<Driver>;
  deleteDriver: (id: string) => Promise<void>;
  createTrip: (data: Parameters<typeof tripsApi.create>[0]) => Promise<Trip>;
  updateTrip: (id: string, data: Parameters<typeof tripsApi.update>[1]) => Promise<Trip>;
  deleteTrip: (id: string) => Promise<void>;
  createParcelExpedition: (data: ParcelExpeditionPayload) => Promise<ParcelExpedition>;
  updateParcelExpedition: (
    id: string,
    data: Partial<ParcelExpeditionPayload>,
  ) => Promise<ParcelExpedition>;
  deleteParcelExpedition: (id: string) => Promise<void>;
  createExpense: (data: Parameters<typeof expensesApi.create>[0]) => Promise<Expense>;
  updateExpense: (id: string, data: Parameters<typeof expensesApi.update>[1]) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
  createInvoice: (data: Parameters<typeof invoicesApi.create>[0]) => Promise<Invoice>;
  updateInvoice: (id: string, data: Parameters<typeof invoicesApi.update>[1]) => Promise<Invoice>;
  deleteInvoice: (id: string) => Promise<void>;
  createThirdParty: (data: Parameters<typeof thirdPartiesApi.create>[0]) => Promise<ThirdParty>;
  updateThirdParty: (id: string, data: Parameters<typeof thirdPartiesApi.update>[1]) => Promise<ThirdParty>;
  deleteThirdParty: (id: string) => Promise<void>;
  createMerchandiseQuality: (
    data: Parameters<typeof merchandiseQualitiesApi.create>[0],
  ) => Promise<MerchandiseQuality>;
  updateMerchandiseQuality: (
    id: string,
    data: Parameters<typeof merchandiseQualitiesApi.update>[1],
  ) => Promise<MerchandiseQuality>;
  deleteMerchandiseQuality: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [parcelExpeditions, setParcelExpeditions] = useState<ParcelExpedition[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [merchandiseQualities, setMerchandiseQualities] = useState<MerchandiseQuality[]>([]);
  const [subCategories, setSubCategories] = useState<Record<string, string[]>>(getInitialSubCategories);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  function dedup<T extends { id: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  const refreshTrucks = async () => {
    try {
      const data = await trucksApi.getAll();
      setTrucks(dedup(Array.isArray(data) ? data.map(normalizeTruck) : []));
    } catch (e) {
      console.error('refreshTrucks', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  const refreshDrivers = async () => {
    try {
      const data = await driversApi.getAll();
      setDrivers(dedup(Array.isArray(data) ? data.map(normalizeDriver) : []));
    } catch (e) {
      console.error('refreshDrivers', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  const refreshTrips = async () => {
    try {
      const data = await tripsApi.getAll();
      setTrips(dedup(Array.isArray(data) ? data.map(normalizeTrip) : []));
    } catch (e) {
      console.error('refreshTrips', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  const refreshParcelExpeditions = async (
    params?: import('@/lib/api').ParcelExpeditionQueryParams,
  ) => {
    try {
      const data = await parcelExpeditionsApi.getAll(params);
      setParcelExpeditions(
        dedup(
          Array.isArray(data)
            ? data.map((row) => normalizeParcelExpedition(row as Record<string, unknown>))
            : [],
        ),
      );
    } catch (e) {
      console.error('refreshParcelExpeditions', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  const refreshExpenses = async () => {
    try {
      const data = await expensesApi.getAll();
      setExpenses(dedup(Array.isArray(data) ? data.map(normalizeExpense) : []));
    } catch (e) {
      console.error('refreshExpenses', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  const refreshInvoices = async () => {
    try {
      const data = await invoicesApi.getAll();
      setInvoices(dedup(Array.isArray(data) ? data.map(normalizeInvoice) : []));
    } catch (e) {
      console.error('refreshInvoices', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  const refreshThirdParties = async () => {
    try {
      const data = await thirdPartiesApi.getAll();
      setThirdParties(dedup(Array.isArray(data) ? data.map(normalizeThirdParty) : []));
    } catch (e) {
      console.error('refreshThirdParties', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  const refreshMerchandiseQualities = async () => {
    try {
      const data = await merchandiseQualitiesApi.getAll();
      setMerchandiseQualities(
        dedup(
          Array.isArray(data) ? data.map((row) => normalizeMerchandiseQuality(row as Record<string, unknown>)) : [],
        ),
      );
    } catch (e) {
      console.error('refreshMerchandiseQualities', e);
      setApiError(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setApiError(null);
    setIsLoading(true);

    const load = async () => {
      try {
        await Promise.all([
          refreshTrucks(),
          refreshDrivers(),
          refreshTrips(),
          refreshParcelExpeditions(),
          refreshExpenses(),
          refreshInvoices(),
          refreshThirdParties(),
          refreshMerchandiseQualities(),
          ...(isRemoteCaisse()
            ? [refreshCaisseFromApi(), refreshBankFromApi()]
            : []),
        ]);
        if (!cancelled) setApiError(null);
      } catch (e) {
        if (!cancelled) {
          setApiError(e instanceof Error ? e.message : 'Impossible de charger les données');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SUBCATEGORIES_STORAGE_KEY, JSON.stringify(subCategories));
    } catch {
      // Ignore localStorage quota / privacy errors.
    }
  }, [subCategories]);

  const createTruck = async (data: Parameters<typeof trucksApi.create>[0]) => {
    const r = await trucksApi.create(data);
    void refreshTrucks();
    return normalizeTruck(r as Record<string, unknown>);
  };

  const updateTruck = async (id: string, data: Parameters<typeof trucksApi.update>[1]) => {
    const r = await trucksApi.update(id, data);
    void refreshTrucks();
    return normalizeTruck(r as Record<string, unknown>);
  };

  const deleteTruck = async (id: string) => {
    await trucksApi.delete(id);
    void refreshTrucks();
  };

  const createDriver = async (data: Parameters<typeof driversApi.create>[0]) => {
    const r = await driversApi.create(data);
    void refreshDrivers();
    return normalizeDriver(r as Record<string, unknown>);
  };

  const updateDriver = async (id: string, data: Parameters<typeof driversApi.update>[1]) => {
    const r = await driversApi.update(id, data);
    void refreshDrivers();
    return normalizeDriver(r as Record<string, unknown>);
  };

  const deleteDriver = async (id: string) => {
    await driversApi.delete(id);
    void refreshDrivers();
  };

  const createTrip = async (data: Parameters<typeof tripsApi.create>[0]) => {
    const r = await tripsApi.create(data);
    void refreshTrips();
    return normalizeTrip(r as Record<string, unknown>);
  };

  const updateTrip = async (id: string, data: Parameters<typeof tripsApi.update>[1]) => {
    const r = await tripsApi.update(id, data);
    void refreshTrips();
    return normalizeTrip(r as Record<string, unknown>);
  };

  const deleteTrip = async (id: string) => {
    await tripsApi.delete(id);
    void refreshTrips();
  };

  const createParcelExpedition = async (data: ParcelExpeditionPayload) => {
    const r = await parcelExpeditionsApi.create(data);
    void refreshParcelExpeditions();
    return normalizeParcelExpedition(r as Record<string, unknown>);
  };

  const updateParcelExpedition = async (id: string, data: Partial<ParcelExpeditionPayload>) => {
    const r = await parcelExpeditionsApi.update(id, data);
    void refreshParcelExpeditions();
    return normalizeParcelExpedition(r as Record<string, unknown>);
  };

  const deleteParcelExpedition = async (id: string) => {
    await parcelExpeditionsApi.delete(id);
    void refreshParcelExpeditions();
  };

  const createExpense = async (data: Parameters<typeof expensesApi.create>[0]) => {
    const r = await expensesApi.create(data);
    void refreshExpenses();
    return normalizeExpense(r as Record<string, unknown>);
  };

  const updateExpense = async (id: string, data: Parameters<typeof expensesApi.update>[1]) => {
    const r = await expensesApi.update(id, data);
    void refreshExpenses();
    return normalizeExpense(r as Record<string, unknown>);
  };

  const deleteExpense = async (id: string) => {
    await expensesApi.delete(id);
    void refreshExpenses();
  };

  const createInvoice = async (data: Parameters<typeof invoicesApi.create>[0]) => {
    const r = await invoicesApi.create(data);
    await refreshInvoices();
    return normalizeInvoice(r as Record<string, unknown>);
  };

  const updateInvoice = async (id: string, data: Parameters<typeof invoicesApi.update>[1]) => {
    const r = await invoicesApi.update(id, data);
    await refreshInvoices();
    return normalizeInvoice(r as Record<string, unknown>);
  };

  const deleteInvoice = async (id: string) => {
    await invoicesApi.delete(id);
    await refreshInvoices();
  };

  const createThirdParty = async (data: Parameters<typeof thirdPartiesApi.create>[0]) => {
    const r = await thirdPartiesApi.create(data);
    void refreshThirdParties();
    return normalizeThirdParty(r as Record<string, unknown>);
  };

  const updateThirdParty = async (id: string, data: Parameters<typeof thirdPartiesApi.update>[1]) => {
    const r = await thirdPartiesApi.update(id, data);
    void refreshThirdParties();
    return normalizeThirdParty(r as Record<string, unknown>);
  };

  const deleteThirdParty = async (id: string) => {
    await thirdPartiesApi.delete(id);
    void refreshThirdParties();
  };

  const createMerchandiseQuality = async (
    data: Parameters<typeof merchandiseQualitiesApi.create>[0],
  ) => {
    const r = await merchandiseQualitiesApi.create(data);
    void refreshMerchandiseQualities();
    return normalizeMerchandiseQuality(r as Record<string, unknown>);
  };

  const updateMerchandiseQuality = async (
    id: string,
    data: Parameters<typeof merchandiseQualitiesApi.update>[1],
  ) => {
    const r = await merchandiseQualitiesApi.update(id, data);
    void refreshMerchandiseQualities();
    return normalizeMerchandiseQuality(r as Record<string, unknown>);
  };

  const deleteMerchandiseQuality = async (id: string) => {
    await merchandiseQualitiesApi.delete(id);
    void refreshMerchandiseQualities();
  };

  return (
    <AppContext.Provider
      value={{
        trucks,
        setTrucks,
        trips,
        setTrips,
        parcelExpeditions,
        setParcelExpeditions,
        expenses,
        setExpenses,
        invoices,
        setInvoices,
        drivers,
        setDrivers,
        thirdParties,
        setThirdParties,
        merchandiseQualities,
        setMerchandiseQualities,
        subCategories,
        setSubCategories,
        isLoading,
        apiError,
        refreshTrucks,
        refreshDrivers,
        refreshTrips,
        refreshParcelExpeditions,
        refreshExpenses,
        refreshInvoices,
        refreshThirdParties,
        refreshMerchandiseQualities,
        createTruck,
        updateTruck,
        deleteTruck,
        createDriver,
        updateDriver,
        deleteDriver,
        createTrip,
        updateTrip,
        deleteTrip,
        createParcelExpedition,
        updateParcelExpedition,
        deleteParcelExpedition,
        createExpense,
        updateExpense,
        deleteExpense,
        createInvoice,
        updateInvoice,
        deleteInvoice,
        createThirdParty,
        updateThirdParty,
        deleteThirdParty,
        createMerchandiseQuality,
        updateMerchandiseQuality,
        deleteMerchandiseQuality,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
