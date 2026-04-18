/**
 * Comptes / transactions bancaires : localStorage hors ligne, ou API Nest + Supabase si VITE_API_URL.
 */
import type { BankAccount, BankTransaction } from '@/lib/bank-types';
import { bankApi } from '@/lib/api';
import { isBankCreditType } from '@/lib/bank-rules';
import { getCaisseSoldeInitialSync, getCaisseTransactions, isRemoteCaisse } from '@/lib/caisse-local';

const ACCOUNTS_KEY = 'bank_accounts';
const TRANSACTIONS_KEY = 'bank_transactions';

/** Même critère que la caisse : backend + Supabase actifs. */
export function isRemoteBank(): boolean {
  return isRemoteCaisse();
}

let _bankAccountsCache: BankAccount[] = [];
let _bankTransactionsCache: BankTransaction[] = [];

function parseNum(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  return 0;
}

function normalizeDate(d: string): string {
  return d.includes('T') ? d.split('T')[0] : d;
}

export function normalizeBankAccountFromApi(r: Record<string, unknown>): BankAccount {
  const { transactions: _tx, compte: _c, ...rest } = r;
  return {
    id: String(rest.id),
    nom: String(rest.nom),
    numeroCompte: String(rest.numeroCompte),
    banque: String(rest.banque),
    type: rest.type as BankAccount['type'],
    soldeInitial: parseNum(rest.soldeInitial),
    soldeActuel: parseNum(rest.soldeActuel),
    devise: rest.devise ? String(rest.devise) : 'FCFA',
    iban: rest.iban ? String(rest.iban) : undefined,
    swift: rest.swift ? String(rest.swift) : undefined,
    notes: rest.notes ? String(rest.notes) : undefined,
  };
}

export function normalizeBankTransactionFromApi(r: Record<string, unknown>): BankTransaction {
  const compteId = r.compteId ?? (r.compte as { id?: string } | undefined)?.id;
  return {
    id: String(r.id),
    compteId: String(compteId ?? ''),
    type: r.type as BankTransaction['type'],
    montant: parseNum(r.montant),
    date: normalizeDate(String(r.date)),
    description: String(r.description),
    reference: r.reference ? String(r.reference) : undefined,
    beneficiaire: r.beneficiaire ? String(r.beneficiaire) : undefined,
    categorie: r.categorie ? String(r.categorie) : undefined,
  };
}

function dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Recharge le cache banque depuis l’API (à appeler au démarrage et après chaque mutation). */
export async function refreshBankFromApi(): Promise<void> {
  if (!isRemoteCaisse()) return;
  const [accs, txs] = await Promise.all([
    bankApi.getAccounts(),
    bankApi.getTransactions(),
  ]);
  _bankAccountsCache = dedupById(
    (Array.isArray(accs) ? accs : []).map((a) => normalizeBankAccountFromApi(a as Record<string, unknown>)),
  );
  _bankTransactionsCache = dedupById(
    (Array.isArray(txs) ? txs : []).map((t) => normalizeBankTransactionFromApi(t as Record<string, unknown>)),
  );
}

function loadLocalAccounts(): BankAccount[] {
  try {
    const s = localStorage.getItem(ACCOUNTS_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function loadLocalTransactions(): BankTransaction[] {
  try {
    const s = localStorage.getItem(TRANSACTIONS_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export function getBankAccounts(): BankAccount[] {
  if (isRemoteCaisse()) {
    return [..._bankAccountsCache];
  }
  return loadLocalAccounts();
}

export function getBankTransactions(): BankTransaction[] {
  if (isRemoteCaisse()) {
    return [..._bankTransactionsCache];
  }
  return loadLocalTransactions();
}

export function setBankAccounts(accounts: BankAccount[]): void {
  if (isRemoteCaisse()) {
    console.warn('[bank] setBankAccounts ignoré en mode API — utiliser bankApi + refreshBankFromApi');
    return;
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function setBankTransactions(transactions: BankTransaction[]): void {
  if (isRemoteCaisse()) {
    console.warn('[bank] setBankTransactions ignoré en mode API');
    return;
  }
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

/** Solde calculé comme sur l’écran Banque (soldeInitial + mouvements). */
export function calculateAccountBalance(
  accountId: string,
  accounts: BankAccount[],
  transactions: BankTransaction[],
): number {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  let balance = account.soldeInitial;
  transactions
    .filter((t) => t.compteId === accountId)
    .forEach((transaction) => {
      balance += isBankCreditType(transaction.type)
        ? transaction.montant
        : -transaction.montant;
    });
  return balance;
}

export function recalculateAllBalances(
  accounts: BankAccount[],
  transactions: BankTransaction[],
): BankAccount[] {
  return accounts.map((acc) => ({
    ...acc,
    soldeActuel: calculateAccountBalance(acc.id, accounts, transactions),
  }));
}

function appendBankTransactionLocal(tx: BankTransaction): void {
  const accounts = loadLocalAccounts();
  const transactions = [...loadLocalTransactions(), tx];
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(recalculateAllBalances(accounts, transactions)));
}

export function removeBankTransaction(bankTransactionId: string): void {
  if (isRemoteCaisse()) {
    console.warn('[bank] removeBankTransaction sync appelé en mode API — utiliser removeBankTransactionAsync');
    return;
  }
  const accounts = loadLocalAccounts();
  const transactions = loadLocalTransactions().filter((t) => t.id !== bankTransactionId);
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(recalculateAllBalances(accounts, transactions)));
}

export async function removeBankTransactionAsync(bankTransactionId: string): Promise<void> {
  if (isRemoteCaisse()) {
    await bankApi.deleteTransaction(bankTransactionId);
    await refreshBankFromApi();
    return;
  }
  removeBankTransaction(bankTransactionId);
}

/** Réinsère une transaction après rollback (ex. édition caisse). Retourne l’id banque (nouvel UUID en API). */
export async function recreateBankTransaction(tx: BankTransaction): Promise<string> {
  if (isRemoteCaisse()) {
    const saved = await bankApi.createTransaction({
      compteId: tx.compteId,
      type: tx.type,
      montant: tx.montant,
      date: normalizeDate(tx.date),
      description: tx.description,
      reference: tx.reference,
      beneficiaire: tx.beneficiaire,
      categorie: tx.categorie,
    });
    await refreshBankFromApi();
    return String((saved as { id: string }).id);
  }
  appendBankTransactionLocal(tx);
  return tx.id;
}

/** Retrait bancaire pour alimenter la caisse (entrée caisse). */
export async function addRetraitPourCaisse(params: {
  compteId: string;
  montant: number;
  date: string;
  descriptionCaisse: string;
  caisseTransactionId: string;
}): Promise<{ ok: true; bankTransactionId: string } | { ok: false; message: string }> {
  const dateStr = normalizeDate(params.date);

  if (isRemoteCaisse()) {
    const accounts = getBankAccounts();
    const transactions = getBankTransactions();
    const disponible = calculateAccountBalance(params.compteId, accounts, transactions);
    if (params.montant <= 0) {
      return { ok: false, message: 'Le montant doit être positif.' };
    }
    if (disponible < params.montant) {
      return {
        ok: false,
        message: `Solde bancaire insuffisant. Disponible : ${disponible.toLocaleString('fr-FR')} FCFA`,
      };
    }
    try {
      const saved = await bankApi.createTransaction({
        compteId: params.compteId,
        type: 'retrait',
        montant: params.montant,
        date: dateStr,
        description: `Alimentation caisse — ${params.descriptionCaisse}`,
        reference: `caisse:${params.caisseTransactionId}`,
        categorie: 'Caisse',
      });
      await refreshBankFromApi();
      return { ok: true, bankTransactionId: String((saved as { id: string }).id) };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Erreur lors du prélèvement bancaire',
      };
    }
  }

  const accounts = loadLocalAccounts();
  const transactions = loadLocalTransactions();
  const disponible = calculateAccountBalance(params.compteId, accounts, transactions);

  if (params.montant <= 0) {
    return { ok: false, message: 'Le montant doit être positif.' };
  }
  if (disponible < params.montant) {
    return {
      ok: false,
      message: `Solde bancaire insuffisant. Disponible : ${disponible.toLocaleString('fr-FR')} FCFA`,
    };
  }

  const bankTransactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newTx: BankTransaction = {
    id: bankTransactionId,
    compteId: params.compteId,
    type: 'retrait',
    montant: params.montant,
    date: dateStr,
    description: `Alimentation caisse — ${params.descriptionCaisse}`,
    reference: `caisse:${params.caisseTransactionId}`,
    categorie: 'Caisse',
  };

  const newTransactions = [...transactions, newTx];
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(newTransactions));
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(recalculateAllBalances(accounts, newTransactions)));

  return { ok: true, bankTransactionId };
}

/**
 * Crédite un compte (type `virement`) lorsqu'un client règle une facture par virement.
 */
export async function appendVirementFromInvoicePayment(params: {
  compteId: string;
  montant: number;
  date: string;
  factureNumero: string;
  factureId: string;
  description?: string;
}): Promise<void> {
  if (params.montant <= 0 || !params.compteId) return;
  const dateStr = normalizeDate(params.date);

  if (isRemoteCaisse()) {
    await bankApi.createTransaction({
      compteId: params.compteId,
      type: 'virement',
      montant: params.montant,
      date: dateStr,
      description: params.description ?? `Encaissement facture ${params.factureNumero}`,
      reference: `facture:${params.factureId}`,
      categorie: 'Factures clients',
    });
    await refreshBankFromApi();
    return;
  }

  const bankTransactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  appendBankTransactionLocal({
    id: bankTransactionId,
    compteId: params.compteId,
    type: 'virement',
    montant: params.montant,
    date: dateStr,
    description: params.description ?? `Encaissement facture ${params.factureNumero}`,
    reference: `facture:${params.factureId}`,
    categorie: 'Factures clients',
  });
}

/**
 * Prélèvement lors du règlement d’une facture fournisseur.
 * Le solde doit avoir été vérifié avant (ex. assertBankDebitAllowed).
 */
export async function appendPrelevementFromExpenseInvoicePayment(params: {
  compteId: string;
  montant: number;
  date: string;
  factureNumero: string;
  factureId: string;
  description?: string;
}): Promise<void> {
  if (params.montant <= 0 || !params.compteId) return;
  const dateStr = normalizeDate(params.date);

  if (isRemoteCaisse()) {
    await bankApi.createTransaction({
      compteId: params.compteId,
      type: 'prelevement',
      montant: params.montant,
      date: dateStr,
      description: params.description ?? `Paiement facture fournisseur ${params.factureNumero}`,
      reference: `facture:${params.factureId}`,
      categorie: 'Factures fournisseurs',
    });
    await refreshBankFromApi();
    return;
  }

  const bankTransactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  appendBankTransactionLocal({
    id: bankTransactionId,
    compteId: params.compteId,
    type: 'prelevement',
    montant: params.montant,
    date: dateStr,
    description: params.description ?? `Paiement facture fournisseur ${params.factureNumero}`,
    reference: `facture:${params.factureId}`,
    categorie: 'Factures fournisseurs',
  });
}

export function assertBankDebitAllowed(
  compteId: string,
  montant: number,
): { ok: true; disponible: number } | { ok: false; disponible: number; message: string } {
  if (!compteId || montant <= 0) {
    return {
      ok: false,
      disponible: 0,
      message: 'Montant ou compte bancaire invalide.',
    };
  }
  const accounts = getBankAccounts();
  const transactions = getBankTransactions();
  const disponible = calculateAccountBalance(compteId, accounts, transactions);
  if (disponible < montant) {
    return {
      ok: false,
      disponible,
      message: `Solde bancaire insuffisant pour payer cette dépense. Disponible : ${disponible.toLocaleString('fr-FR')} FCFA — montant à régler : ${montant.toLocaleString('fr-FR')} FCFA.`,
    };
  }
  return { ok: true, disponible };
}

export function getCaisseSoldeActuel(): number {
  try {
    const soldeInitial = getCaisseSoldeInitialSync();
    const transactions = getCaisseTransactions();
    return (
      soldeInitial +
      transactions.reduce((sum, t) => (t.type === 'entree' ? sum + t.montant : sum - t.montant), 0)
    );
  } catch {
    return 0;
  }
}

export function getTotalBanqueDisponible(): number {
  const accs = getBankAccounts();
  const txs = getBankTransactions();
  if (accs.length === 0) return 0;
  return accs.reduce((s, a) => s + calculateAccountBalance(a.id, accs, txs), 0);
}
