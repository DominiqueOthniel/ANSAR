import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Wallet, TrendingUp, TrendingDown, Search, FileDown, FileText, HardDrive, Upload, Landmark, Receipt, Layers, Heart, Loader2 } from 'lucide-react';
import { useRef } from 'react';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import { Checkbox } from '@/components/ui/checkbox';
import type { BankAccount, BankTransaction } from '@/lib/bank-types';
import {
  addRetraitPourCaisse,
  calculateAccountBalance,
  getBankAccounts,
  getBankTransactions,
  recreateBankTransaction,
  refreshBankFromApi,
  removeBankTransactionAsync,
} from '@/lib/bank-local';
import { useApp } from '@/contexts/AppContext';
import { getTotalCreancesClients } from '@/lib/sync-utils';
import {
  type CaisseTransaction,
  getCaisseTransactions,
  setCaisseTransactions,
  isFinancementEntree,
  isRemoteCaisse,
  refreshCaisseFromApi,
  persistCaisseSoldeInitial,
  getCaisseSoldeInitialSync,
  saveCaisseTransactionRemote,
  deleteCaisseTransactionRemote,
} from '@/lib/caisse-local';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';

const CAISSE_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (récent → ancien)' },
  { value: 'date_asc', label: 'Date (ancien → récent)' },
  { value: 'montant_desc', label: 'Montant (plus haut → plus bas)' },
  { value: 'montant_asc', label: 'Montant (plus bas → plus haut)' },
  { value: 'type_entree_first', label: 'Type : entrées puis sorties' },
  { value: 'description_asc', label: 'Description A → Z' },
] as const;

export type { CaisseTransaction };

export default function Caisse() {
  const { invoices } = useApp();
  const { canManageTreasury, user } = useAuth();
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const [transactions, setTransactions] = useState<CaisseTransaction[]>([]);

  const [soldeInitial, setSoldeInitial] = useState(0);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<CaisseTransaction | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [listSort, setListSort] = useState<string>('date_desc');

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [formData, setFormData] = useState({
    type: 'entree' as 'entree' | 'sortie',
    montant: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
    categorie: '',
    reference: '',
    /** Financement (entrée uniquement) : hors encaissement d’activité sur le tableau de bord. */
    exclutRevenu: false,
  });

  /** Entrée : prélever le montant sur le compte bancaire (solde disponible) */
  const [deduireSurBanque, setDeduireSurBanque] = useState(true);
  const [compteBanqueId, setCompteBanqueId] = useState<string>(() => getBankAccounts()[0]?.id ?? '');

  const refreshBankAccounts = () => {
    setBankAccounts(getBankAccounts());
  };

  useEffect(() => {
    refreshBankAccounts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isRemoteCaisse()) {
          await refreshCaisseFromApi();
          await refreshBankFromApi();
        }
        if (!cancelled) {
          setTransactions(getCaisseTransactions());
          setSoldeInitial(getCaisseSoldeInitialSync());
        }
      } catch (e) {
        console.error(e);
        toast.error('Impossible de charger la caisse (vérifiez le backend et VITE_API_URL).');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isDialogOpen) refreshBankAccounts();
  }, [isDialogOpen]);

  /** Recharger les soldes banque depuis le localStorage quand la caisse change (ex. prélèvement lié). */
  useEffect(() => {
    refreshBankAccounts();
  }, [transactions]);

  /** Soldes bancaires recalculés (même logique que l’écran Banque) — dynamique avec dépôts, retraits, caisse liée. */
  const statsBanque = useMemo(() => {
    const accs = getBankAccounts();
    const txs = getBankTransactions();
    if (accs.length === 0) {
      return { totalDisponible: 0, parCompte: [] as { id: string; nom: string; solde: number }[] };
    }
    const parCompte = accs.map((a) => ({
      id: a.id,
      nom: a.nom,
      solde: calculateAccountBalance(a.id, accs, txs),
    }));
    const totalDisponible = parCompte.reduce((s, p) => s + p.solde, 0);
    return { totalDisponible, parCompte };
  }, [bankAccounts, transactions]);

  const soldeDisponibleBanque = useMemo(() => {
    if (!compteBanqueId || !deduireSurBanque || formData.type !== 'entree') return null;
    return calculateAccountBalance(compteBanqueId, bankAccounts, getBankTransactions());
  }, [compteBanqueId, deduireSurBanque, formData.type, bankAccounts]);

  const saveTransactions = (newTransactions: CaisseTransaction[]) => {
    setTransactions(newTransactions);
    if (!isRemoteCaisse()) {
      setCaisseTransactions(newTransactions);
    }
  };

  const saveSoldeInitial = async (value: number) => {
    setSoldeInitial(value);
    try {
      if (isRemoteCaisse()) {
        await persistCaisseSoldeInitial(value);
      } else {
        localStorage.setItem('caisse_solde_initial', String(value));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur enregistrement solde initial');
    }
  };

  const soldeActuel = soldeInitial + transactions.reduce((sum, t) => {
    return t.type === 'entree' ? sum + t.montant : sum - t.montant;
  }, 0);

  /** Après soldeActuel : évite ReferenceError (TDZ) si déclaré trop tôt. */
  const tresorerieTotale = soldeActuel + statsBanque.totalDisponible;

  /** Créances factures (hors caisse/banque) — même logique que le tableau de bord. */
  const creancesClients = useMemo(() => getTotalCreancesClients(invoices), [invoices]);
  const positionEntreprise = tresorerieTotale + creancesClients;

  const totalEntrees = transactions.filter((t) => t.type === 'entree').reduce((sum, t) => sum + t.montant, 0);
  const totalEntreesFinancement = transactions.filter(isFinancementEntree).reduce((sum, t) => sum + t.montant, 0);
  const totalEntreesActivite = totalEntrees - totalEntreesFinancement;

  const totalSorties = transactions.filter((t) => t.type === 'sortie').reduce((sum, t) => sum + t.montant, 0);
  const totalSortiesActivite = totalSorties;

  const resetForm = () => {
    setFormData({
      type: 'entree',
      montant: 0,
      date: new Date().toISOString().split('T')[0],
      description: '',
      categorie: '',
      reference: '',
      exclutRevenu: false,
    });
    setEditingTransaction(null);
    const accs = getBankAccounts();
    setDeduireSurBanque(accs.length > 0);
    setCompteBanqueId(accs[0]?.id ?? '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const montant = Number(formData.montant);
    if (!Number.isFinite(montant) || montant <= 0) {
      toast.error('Indique un montant valide.');
      return;
    }

    await withGuard(async () => {
    const shouldDeduireBanque =
      formData.type === 'entree' &&
      deduireSurBanque &&
      Boolean(compteBanqueId) &&
      getBankAccounts().length > 0;

    if (editingTransaction) {
      const prevLinked = editingTransaction.bankTransactionId;

      if (prevLinked && (formData.type !== 'entree' || !shouldDeduireBanque)) {
        await removeBankTransactionAsync(prevLinked);
      }

      const base: CaisseTransaction = {
        ...formData,
        id: editingTransaction.id,
        montant,
        utilisateur: editingTransaction.utilisateur || user?.login || 'system',
        compteBanqueId: undefined,
        bankTransactionId: undefined,
        exclutRevenu: formData.type === 'entree' && formData.exclutRevenu ? true : undefined,
      };

      if (formData.type === 'entree' && shouldDeduireBanque) {
        const oldBankTx: BankTransaction | undefined = prevLinked
          ? getBankTransactions().find((x) => x.id === prevLinked)
          : undefined;
        if (prevLinked) {
          await removeBankTransactionAsync(prevLinked);
        }
        const result = await addRetraitPourCaisse({
          compteId: compteBanqueId,
          montant,
          date: formData.date,
          descriptionCaisse: formData.description,
          caisseTransactionId: editingTransaction.id,
        });
        if (!result.ok) {
          if (oldBankTx) await recreateBankTransaction(oldBankTx);
          toast.error(result.message);
          return;
        }
        base.compteBanqueId = compteBanqueId;
        base.bankTransactionId = result.bankTransactionId;
      }

      try {
        if (isRemoteCaisse()) {
          await saveCaisseTransactionRemote(base, false);
          setTransactions(getCaisseTransactions());
          setSoldeInitial(getCaisseSoldeInitialSync());
        } else {
          const updated = transactions.map((t) => (t.id === editingTransaction.id ? base : t));
          saveTransactions(updated);
        }
        toast.success('Transaction modifiée avec succès');
        setIsDialogOpen(false);
        resetForm();
        refreshBankAccounts();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur enregistrement caisse');
      }
      return;
    }

    const newId = Date.now().toString();
    const newTransaction: CaisseTransaction = {
      ...formData,
      id: newId,
      montant,
      utilisateur: user?.login || 'system',
      exclutRevenu: formData.type === 'entree' && formData.exclutRevenu ? true : undefined,
    };

    if (shouldDeduireBanque) {
      const result = await addRetraitPourCaisse({
        compteId: compteBanqueId,
        montant,
        date: formData.date,
        descriptionCaisse: formData.description,
        caisseTransactionId: newId,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      newTransaction.compteBanqueId = compteBanqueId;
      newTransaction.bankTransactionId = result.bankTransactionId;
    }

    try {
      if (isRemoteCaisse()) {
        await saveCaisseTransactionRemote(newTransaction, true);
        setTransactions(getCaisseTransactions());
        setSoldeInitial(getCaisseSoldeInitialSync());
      } else {
        saveTransactions([...transactions, newTransaction]);
      }
      toast.success('Transaction ajoutée avec succès');
      setIsDialogOpen(false);
      resetForm();
      refreshBankAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur enregistrement caisse');
    }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette transaction ?')) return;
    const t = transactions.find((x) => x.id === id);
    if (t?.bankTransactionId) {
      await removeBankTransactionAsync(t.bankTransactionId);
    }
    try {
      if (isRemoteCaisse()) {
        await deleteCaisseTransactionRemote(id);
        setTransactions(getCaisseTransactions());
        setSoldeInitial(getCaisseSoldeInitialSync());
      } else {
        saveTransactions(transactions.filter((x) => x.id !== id));
      }
      refreshBankAccounts();
      toast.success('Transaction supprimée');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression');
    }
  };

  const handleEdit = (t: CaisseTransaction) => {
    setEditingTransaction(t);
    setFormData({
      type: t.type,
      montant: t.montant,
      date: t.date.split('T')[0] || t.date,
      description: t.description,
      categorie: t.categorie || '',
      reference: t.reference || '',
      exclutRevenu: t.type === 'entree' && Boolean(t.exclutRevenu),
    });
    const accs = getBankAccounts();
    setDeduireSurBanque(Boolean(t.bankTransactionId) || accs.length > 0);
    setCompteBanqueId(t.compteBanqueId || accs[0]?.id || '');
    setIsDialogOpen(true);
  };

  const handleBackupCaisse = () => {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      caisse: {
        soldeInitial,
        transactions,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const filename = `caisse-backup-${new Date().toISOString().split('T')[0]}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Backup caisse téléchargé : ${filename}`);
  };

  const handleRestoreCaisse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Fichier invalide : sélectionnez un fichier .json');
      e.target.value = '';
      return;
    }

    if (isRemoteCaisse()) {
      toast.error(
        'Restauration JSON désactivée en mode serveur (API). Importez les données via SQL ou l’admin.',
      );
      e.target.value = '';
      return;
    }

    if (!confirm(
      '⚠️ ATTENTION : La restauration va remplacer toutes les transactions de caisse actuelles.\n\nContinuer ?'
    )) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.caisse || parsed.caisse.transactions === undefined) {
        throw new Error('Fichier de backup invalide ou incompatible');
      }

      const { soldeInitial: savedSolde, transactions: savedTx } = parsed.caisse;
      saveTransactions(savedTx ?? []);
      void saveSoldeInitial(savedSolde ?? 0);
      toast.success(`Caisse restaurée : ${savedTx?.length ?? 0} transaction(s) importée(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la restauration');
    } finally {
      e.target.value = '';
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterType === 'financement') {
      if (!isFinancementEntree(t)) return false;
    } else if (filterType !== 'all' && t.type !== filterType) return false;
    if (
      searchTerm &&
      !t.description.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !t.reference?.toLowerCase().includes(searchTerm.toLowerCase())
    )
      return false;
    return true;
  });

  const caisseExportSortLine = useMemo(() => {
    const label = CAISSE_SORT_OPTIONS.find((o) => o.value === listSort)?.label;
    return label ? `Tri: ${label}` : undefined;
  }, [listSort]);

  const sortedTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    const typeRank = (t: CaisseTransaction) => (t.type === 'entree' ? 0 : 1);
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.date) - parseDateMs(b.date));
      case 'montant_desc':
        return stableSort(list, (a, b) => b.montant - a.montant);
      case 'montant_asc':
        return stableSort(list, (a, b) => a.montant - b.montant);
      case 'type_entree_first':
        return stableSort(
          list,
          (a, b) => typeRank(a) - typeRank(b) || parseDateMs(b.date) - parseDateMs(a.date),
        );
      case 'description_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.description, b.description));
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.date) - parseDateMs(a.date));
    }
  }, [filteredTransactions, listSort]);

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Mouvements de Caisse',
      fileName: `caisse_${new Date().toISOString().split('T')[0]}.xlsx`,
      filtersDescription: caisseExportSortLine,
      columns: [
        { header: 'Date', value: (t) => new Date(t.date).toLocaleDateString('fr-FR') },
        { header: 'Type', value: (t) => t.type === 'entree' ? 'Entrée' : 'Sortie' },
        { header: 'Montant (FCFA)', value: (t) => t.montant },
        { header: 'Description', value: (t) => t.description },
        { header: 'Utilisateur', value: (t) => t.utilisateur || '-' },
        { header: 'Catégorie', value: (t) => t.categorie || '-' },
        {
          header: 'Financement (hors encaissement)',
          value: (t) => (isFinancementEntree(t) ? 'Oui' : '—'),
        },
      ],
      rows: sortedTransactions,
    });
  };

  const handleExportPDF = () => {
    exportToPrintablePDF({
      title: 'Mouvements de Caisse',
      fileName: `caisse_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: caisseExportSortLine,
      headerColor: '#059669',
      headerTextColor: '#ffffff',
      evenRowColor: '#ecfdf5',
      oddRowColor: '#ffffff',
      accentColor: '#059669',
      totals: [
        { label: 'Solde initial', value: `${soldeInitial.toLocaleString('fr-FR')} FCFA`, style: 'neutral', icon: EMOJI.argent },
        {
          label: 'Entrées activité (hors financement)',
          value: `+${totalEntreesActivite.toLocaleString('fr-FR')} FCFA`,
          style: 'positive',
          icon: EMOJI.entree,
        },
        {
          label: 'Financement reçu (hors encaissement)',
          value: `+${totalEntreesFinancement.toLocaleString('fr-FR')} FCFA`,
          style: 'neutral',
          icon: EMOJI.entree,
        },
        {
          label: 'Total entrées caisse',
          value: `+${totalEntrees.toLocaleString('fr-FR')} FCFA`,
          style: 'positive',
          icon: EMOJI.entree,
        },
        {
          label: 'Sorties caisse',
          value: `-${totalSortiesActivite.toLocaleString('fr-FR')} FCFA`,
          style: 'negative',
          icon: EMOJI.sortie,
        },
        {
          label: 'Total sorties caisse',
          value: `-${totalSorties.toLocaleString('fr-FR')} FCFA`,
          style: 'negative',
          icon: EMOJI.sortie,
        },
      ],
      columns: [
        { header: 'Date', value: (t) => `${EMOJI.date} ${new Date(t.date).toLocaleDateString('fr-FR')}` },
        { header: 'Type', value: (t) => t.type === 'entree' ? `${EMOJI.entree} Entrée` : `${EMOJI.sortie} Sortie`, cellStyle: (t) => t.type === 'entree' ? 'positive' : 'negative' },
        {
          header: 'Montant (FCFA)',
          value: (t) =>
            t.type === 'entree'
              ? `+${t.montant.toLocaleString('fr-FR')}`
              : `-${t.montant.toLocaleString('fr-FR')}`,
          cellStyle: (t) => (t.type === 'entree' ? 'positive' : 'negative'),
        },
        { header: 'Description', value: (t) => t.description },
        { header: 'Utilisateur', value: (t) => t.utilisateur || '-' },
      ],
      rows: sortedTransactions,
    });
  };

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Caisse"
        description="Entrées et sorties de caisse. Pour une entrée, cochez « Financement » si le montant ne doit pas compter comme encaissement d’activité (le tableau de bord reste basé sur les factures et dépenses)."
        icon={Wallet}
        gradient="from-green-500/20 via-emerald-500/10 to-transparent"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleBackupCaisse} className="gap-2">
              <HardDrive className="h-4 w-4" />
              Backup
            </Button>
            <Button variant="outline" size="sm" onClick={() => restoreFileRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" />
              Restaurer
            </Button>
            <input
              ref={restoreFileRef}
              type="file"
              accept=".json"
              aria-label="Sélectionner un fichier de backup caisse JSON"
              className="hidden"
              onChange={handleRestoreCaisse}
            />
            {canManageTreasury && (
              <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Nouvelle transaction
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingTransaction ? 'Modifier la transaction' : 'Nouvelle transaction'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Type *</Label>
                        <Select
                          value={formData.type}
                          onValueChange={(v: 'entree' | 'sortie') => {
                            setFormData({ ...formData, type: v, exclutRevenu: false });
                            if (v === 'sortie') setDeduireSurBanque(false);
                            else if (getBankAccounts().length > 0) setDeduireSurBanque(true);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="entree">Entrée</SelectItem>
                            <SelectItem value="sortie">Sortie</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="montant">Montant (FCFA) *</Label>
                        <Input
                          id="montant"
                          type="number"
                          value={formData.montant || ''}
                          onChange={(e) => setFormData({ ...formData, montant: parseFloat(e.target.value) || 0 })}
                          required
                          min="0"
                        />
                      </div>
                    </div>

                    {formData.type === 'entree' && bankAccounts.length > 0 && (
                      <div className="space-y-3 rounded-lg border border-dashed border-emerald-200 dark:border-emerald-900/50 p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id="deduire-banque"
                            checked={deduireSurBanque}
                            onCheckedChange={(c) => setDeduireSurBanque(c === true)}
                            className="mt-1"
                          />
                          <div>
                            <Label htmlFor="deduire-banque" className="font-medium cursor-pointer">
                              Prélever sur un compte bancaire
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Le montant est déduit du solde disponible du compte (même mouvement enregistré dans Banque).
                            </p>
                          </div>
                        </div>
                        {deduireSurBanque && (
                          <>
                            <div>
                              <Label>Compte bancaire</Label>
                              <Select value={compteBanqueId} onValueChange={setCompteBanqueId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Choisir un compte" />
                                </SelectTrigger>
                                <SelectContent>
                                  {bankAccounts.map((acc) => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                      {acc.nom} — {acc.banque}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {soldeDisponibleBanque !== null && (
                              <div className="flex items-center gap-2 text-sm">
                                <Landmark className="h-4 w-4 text-muted-foreground" />
                                <span>
                                  Solde disponible :{' '}
                                  <strong className="tabular-nums">
                                    {soldeDisponibleBanque.toLocaleString('fr-FR')} FCFA
                                  </strong>
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div>
                      <Label htmlFor="date">Date *</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description *</Label>
                      <Input
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="categorie">Catégorie</Label>
                        <Input
                          id="categorie"
                          value={formData.categorie}
                          onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="reference">Référence</Label>
                        <Input
                          id="reference"
                          value={formData.reference}
                          onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                        />
                      </div>
                    </div>

                    {formData.type === 'entree' && (
                    <div className="rounded-lg border border-violet-200/80 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/25 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="exclut-revenu"
                          checked={formData.exclutRevenu}
                          onCheckedChange={(c) => {
                            const on = c === true;
                            setFormData((f) => ({
                              ...f,
                              exclutRevenu: on,
                              categorie:
                                on && !f.categorie.trim()
                                  ? 'Financement'
                                  : f.categorie,
                            }));
                          }}
                          className="mt-1"
                        />
                        <div className="space-y-1">
                          <Label htmlFor="exclut-revenu" className="font-medium cursor-pointer flex items-center gap-1.5">
                            <Heart className="h-3.5 w-3.5 text-violet-600" />
                            Financement (hors encaissement / bénéfice)
                          </Label>
                          <p className="text-xs text-muted-foreground leading-snug">
                            Le montant augmente le solde caisse mais n’entre pas dans l’« encaissement » du tableau de bord (basé sur les factures).
                          </p>
                        </div>
                      </div>
                    </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>Annuler</Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</>
                        ) : (
                          editingTransaction ? 'Modifier' : 'Ajouter'
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="outline" onClick={handleExportExcel}>
              <FileDown className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        }
      />

      {/* Statistiques : caisse + banque + trésorerie (tout recalculé à partir des mouvements) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Caisse (espèces)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${soldeActuel >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {soldeActuel.toLocaleString('fr-FR')} FCFA
            </div>
            <p className="text-xs text-muted-foreground mt-1">Solde actuel caisse</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Landmark className="h-4 w-4 text-amber-600" />
              Solde banque (disponible)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${statsBanque.totalDisponible >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-red-600'}`}>
              {statsBanque.totalDisponible.toLocaleString('fr-FR')} FCFA
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Somme des comptes — mis à jour via Banque et les prélèvements caisse
            </p>
            {statsBanque.parCompte.length > 1 && (
              <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 max-h-20 overflow-y-auto">
                {statsBanque.parCompte.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{c.nom}</span>
                    <span className="tabular-nums shrink-0">{c.solde.toLocaleString('fr-FR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Trésorerie totale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${tresorerieTotale >= 0 ? 'text-primary' : 'text-red-600'}`}>
              {tresorerieTotale.toLocaleString('fr-FR')} FCFA
            </div>
            <p className="text-xs text-muted-foreground mt-1">Caisse + tous les comptes banque</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Entrées caisse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Activité (hors financement)</p>
              <div className="text-xl font-bold text-green-600 tabular-nums">
                +{totalEntreesActivite.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
            {totalEntreesFinancement > 0 && (
              <div className="pt-1 border-t border-border/60">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Heart className="h-3 w-3 text-violet-600" /> Financement (hors encaissement)
                </p>
                <div className="text-sm font-semibold text-violet-700 dark:text-violet-400 tabular-nums">
                  +{totalEntreesFinancement.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground pt-1">
              Total brut :{' '}
              <span className="font-medium text-foreground tabular-nums">{totalEntrees.toLocaleString('fr-FR')} FCFA</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Sorties caisse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Toutes les sorties</p>
              <div className="text-xl font-bold text-red-600 tabular-nums">
                −{totalSortiesActivite.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Total brut :{' '}
              <span className="font-medium text-foreground tabular-nums">{totalSorties.toLocaleString('fr-FR')} FCFA</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Même démarcation que le dashboard : liquidités vs créances hors trésorerie */}
      <Card className="border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-background to-sky-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Liquidités vs hors trésorerie
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            La caisse et la banque = <strong className="text-foreground">liquidités</strong>. Les factures non soldées ={' '}
            <strong className="text-foreground">créances</strong> (pas encore en caisse/banque dans l’app).
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-4">
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" /> Sous-total liquidités
              </p>
              <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {tresorerieTotale.toLocaleString('fr-FR')} FCFA
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Caisse + banques (ci-dessus)</p>
            </div>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20 p-4">
              <p className="text-xs font-medium text-sky-800 dark:text-sky-300 mb-2 flex items-center gap-1">
                <Receipt className="h-3.5 w-3.5" /> Hors caisse &amp; banque
              </p>
              <p className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
                {creancesClients.toLocaleString('fr-FR')} FCFA
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Créances clients (factures)</p>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 dark:bg-primary/10 p-4">
              <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> Position globale
              </p>
              <p className="text-xl font-bold tabular-nums text-primary">
                {positionEntreprise.toLocaleString('fr-FR')} FCFA
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Liquidités + créances</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Solde initial — trésorerie (gestionnaire / admin) */}
      {canManageTreasury && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-sm text-muted-foreground">Solde initial :</span>
          <Input
            type="number"
            value={soldeInitial}
            onChange={(e) => setSoldeInitial(parseFloat(e.target.value) || 0)}
            onBlur={() => void saveSoldeInitial(soldeInitial)}
            className="w-40 h-8 text-sm"
          />
          <span className="text-sm text-muted-foreground">FCFA</span>
        </div>
      )}

      {/* Liste des transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Mouvements de caisse</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="entree">Entrées</SelectItem>
                  <SelectItem value="sortie">Sorties</SelectItem>
                  <SelectItem value="financement">Financement (entrées hors encaissement)</SelectItem>
                </SelectContent>
              </Select>
              <ListSortSelect
                id="sort-caisse"
                value={listSort}
                onChange={setListSort}
                options={[...CAISSE_SORT_OPTIONS]}
                className="min-w-[200px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead className="whitespace-nowrap">Banque</TableHead>
                  <TableHead>Référence</TableHead>
                  {canManageTreasury && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManageTreasury ? 9 : 8} className="text-center py-8 text-muted-foreground">
                      <Wallet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Aucune transaction enregistrée</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedTransactions.map(t => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={t.type === 'entree' ? 'default' : 'secondary'}>
                            {t.type === 'entree' ? 'Entrée' : 'Sortie'}
                          </Badge>
                          {isFinancementEntree(t) && (
                            <Badge variant="outline" className="gap-0.5 border-violet-400/50 text-violet-600 dark:text-violet-400">
                              <Heart className="h-3 w-3" />
                              Financement
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={t.type === 'entree' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {t.type === 'entree' ? '+' : '-'}{t.montant.toLocaleString('fr-FR')} FCFA
                      </TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{t.utilisateur || '—'}</span>
                      </TableCell>
                      <TableCell>
                        {t.bankTransactionId ? (
                          <Badge variant="outline" className="gap-1 font-normal">
                            <Landmark className="h-3 w-3" />
                            Prélevé
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.reference || '-'}</TableCell>
                      {canManageTreasury && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(t)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(t.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
