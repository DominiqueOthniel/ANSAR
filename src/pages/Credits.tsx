import { useRef, useState, useEffect, useMemo } from 'react';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Plus, Edit, Trash2, CreditCard, TrendingUp, TrendingDown,
  Search, CheckCircle2, Clock, AlertTriangle, HardDrive, Upload,
  Banknote, FileDown, Calendar, RotateCcw, Loader2, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { PAGE_CREDITS_DESCRIPTION } from '@/lib/metier-activite';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { creditsApi } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';
import { exportToExcel } from '@/lib/export-utils';
import { CREDITS_DATA_STORAGE_KEY } from '@/lib/credits-constants';
import { useApp } from '@/contexts/AppContext';
import {
  checkPretAccordePlafond,
  findClientTierForPreteur,
  getMontantCibleCredit,
  sumEncoursPretsPourClient,
} from '@/lib/client-credit-plafond';

const CREDIT_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date début (récent → ancien)' },
  { value: 'date_asc', label: 'Date début (ancien → récent)' },
  { value: 'intitule_asc', label: 'Intitulé A → Z' },
  { value: 'reste_desc', label: 'Reste dû (plus haut → plus bas)' },
  { value: 'reste_asc', label: 'Reste dû (plus bas → plus haut)' },
  { value: 'montant_total_desc', label: 'Montant total (plus haut → plus bas)' },
] as const;

/**
 * Registre Crédits : isolé de la caisse, banque et factures.
 * Les plafonds par client s’appuient sur les fiches Clients pour limiter l’encours des commandes / ventes à crédit (non payées).
 */
/** Si VITE_API_URL est défini, les crédits sont lus/écrits via l’API (tables Supabase). */
const USE_CREDITS_API = Boolean(import.meta.env.VITE_API_URL?.trim());

export type CreditStatut = 'en_cours' | 'solde' | 'en_retard';
export type CreditType = 'emprunt' | 'pret_accorde';

export interface Remboursement {
  id: string;
  date: string;
  montant: number;
  note?: string;
}

export interface Credit {
  id: string;
  type: CreditType;
  intitule: string;
  preteur: string;
  /** Fiche client (tiers) pour une commande / vente à crédit — plafonds. */
  clientTierId?: string;
  montantTotal: number;
  montantRembourse: number;
  tauxInteret?: number;
  dateDebut: string;
  dateEcheance?: string;
  statut: CreditStatut;
  notes?: string;
  remboursements: Remboursement[];
}

function parseNum(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function normalizeCreditFromApi(r: Record<string, unknown>): Credit {
  const remboursements = Array.isArray(r.remboursements)
    ? (r.remboursements as Record<string, unknown>[]).map((x) => ({
        id: String(x.id),
        date: String(x.date).split('T')[0],
        montant: parseNum(x.montant),
        note: x.note ? String(x.note) : undefined,
      }))
    : [];
  return {
    id: String(r.id),
    type: r.type as CreditType,
    intitule: String(r.intitule),
    preteur: String(r.preteur),
    montantTotal: parseNum(r.montantTotal),
    montantRembourse: parseNum(r.montantRembourse),
    tauxInteret: r.tauxInteret != null ? parseNum(r.tauxInteret) : undefined,
    dateDebut: String(r.dateDebut).split('T')[0],
    dateEcheance: r.dateEcheance ? String(r.dateEcheance).split('T')[0] : undefined,
    statut: r.statut as CreditStatut,
    notes: r.notes ? String(r.notes) : undefined,
    clientTierId:
      r.clientTierId != null && String(r.clientTierId) !== '' ? String(r.clientTierId) : undefined,
    remboursements,
  };
}

function loadCredits(): Credit[] {
  try {
    const saved = localStorage.getItem(CREDITS_DATA_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveCredits(credits: Credit[]) {
  localStorage.setItem(CREDITS_DATA_STORAGE_KEY, JSON.stringify(credits));
}

function getMontantCible(c: Credit): number {
  const taux = c.tauxInteret ?? 0;
  return c.montantTotal + (c.montantTotal * taux) / 100;
}

const emptyForm = {
  type: 'emprunt' as CreditType,
  intitule: '',
  preteur: '',
  clientTierId: 'none' as string,
  montantTotal: 0,
  tauxInteret: 0,
  dateDebut: new Date().toISOString().split('T')[0],
  dateEcheance: '',
  notes: '',
};

function creditClientTierPayload(f: typeof emptyForm) {
  return {
    clientTierId:
      f.type === 'pret_accorde' && f.clientTierId && f.clientTierId !== 'none'
        ? f.clientTierId
        : null,
  };
}

export default function Credits() {
  const { canManageCredits } = useAuth();
  const { thirdParties } = useApp();
  const restoreRef = useRef<HTMLInputElement>(null);

  const [credits, setCredits] = useState<Credit[]>(() => (USE_CREDITS_API ? [] : loadCredits()));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Remboursement
  const [remboursDialogId, setRemboursDialogId] = useState<string | null>(null);
  const [remboursForm, setRemboursForm] = useState({ date: new Date().toISOString().split('T')[0], montant: 0, note: '' });

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
  const [listSort, setListSort] = useState<string>('date_desc');
  const { isSubmitting, withGuard } = useSubmitGuard();
  const { isSubmitting: isRemboursSubmitting, withGuard: withRemboursGuard } = useSubmitGuard();

  const tierClientsFiches = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'client'),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const refreshCreditsFromApi = async () => {
    const data = await creditsApi.getAll();
    setCredits(
      Array.isArray(data) ? data.map((x) => normalizeCreditFromApi(x as Record<string, unknown>)) : [],
    );
  };

  useEffect(() => {
    if (!USE_CREDITS_API) return;
    (async () => {
      try {
        await refreshCreditsFromApi();
      } catch (e) {
        console.error(e);
        toast.error('Impossible de charger les crédits (API).');
      }
    })();
  }, []);

  const persistLocal = (list: Credit[]) => {
    setCredits(list);
    saveCredits(list);
  };

  // Stats
  const emprunts = credits.filter(c => c.type === 'emprunt');
  const prets = credits.filter(c => c.type === 'pret_accorde');
  const totalDu = emprunts.reduce((s, c) => s + (getMontantCible(c) - c.montantRembourse), 0);
  const totalARecevoir = prets.reduce((s, c) => s + (getMontantCible(c) - c.montantRembourse), 0);
  const enRetard = credits.filter(c => c.statut === 'en_retard').length;

  // Filtre
  const filtered = credits.filter(c => {
    if (filterType !== 'all' && c.type !== filterType) return false;
    if (filterStatut !== 'all' && c.statut !== filterStatut) return false;
    if (search && !c.intitule.toLowerCase().includes(search.toLowerCase()) &&
        !c.preteur.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sortedFiltered = useMemo(() => {
    const list = [...filtered];
    const reste = (c: Credit) => c.montantTotal - c.montantRembourse;
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.dateDebut) - parseDateMs(b.dateDebut));
      case 'intitule_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.intitule, b.intitule));
      case 'reste_desc':
        return stableSort(list, (a, b) => reste(b) - reste(a));
      case 'reste_asc':
        return stableSort(list, (a, b) => reste(a) - reste(b));
      case 'montant_total_desc':
        return stableSort(list, (a, b) => b.montantTotal - a.montantTotal);
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.dateDebut) - parseDateMs(a.dateDebut));
    }
  }, [filtered, listSort]);

  const creditsForPlafond = useMemo(
    () =>
      credits.map((c) => ({
        id: c.id,
        type: c.type,
        preteur: c.preteur,
        clientTierId: c.clientTierId,
        montantTotal: c.montantTotal,
        montantRembourse: c.montantRembourse,
        tauxInteret: c.tauxInteret,
      })),
    [credits],
  );

  const clientPlafondApercu = useMemo(() => {
    if (form.type !== 'pret_accorde') return null;
    const client =
      form.clientTierId && form.clientTierId !== 'none'
        ? thirdParties.find((tp) => tp.type === 'client' && tp.id === form.clientTierId)
        : findClientTierForPreteur(thirdParties, form.preteur);
    if (!client || client.plafondCredit == null) return null;
    const plafond = Number(client.plafondCredit);
    if (!Number.isFinite(plafond) || plafond < 0) return null;
    const encours = sumEncoursPretsPourClient(
      creditsForPlafond,
      { id: client.id, nom: client.nom },
      editingId ?? undefined,
    );
    const nouveau = getMontantCibleCredit({
      montantTotal: Number(form.montantTotal) || 0,
      tauxInteret: Number(form.tauxInteret) || 0,
    });
    const disponible = plafond - encours;
    const depasse = encours + nouveau > plafond + 0.01;
    return { clientNom: client.nom, plafond, encours, nouveau, disponible, depasse };
  }, [
    form.type,
    form.clientTierId,
    form.preteur,
    form.montantTotal,
    form.tauxInteret,
    thirdParties,
    creditsForPlafond,
    editingId,
  ]);

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.intitule || !form.preteur || form.montantTotal <= 0) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    await withGuard(async () => {
      try {
        if (form.type === 'pret_accorde') {
          const chk = checkPretAccordePlafond({
            credits: creditsForPlafond,
            thirdParties,
            preteur: form.preteur,
            clientTierId: form.clientTierId !== 'none' ? form.clientTierId : null,
            montantTotal: Number(form.montantTotal),
            tauxInteret: Number(form.tauxInteret) || undefined,
            excludeCreditId: editingId ?? undefined,
          });
          if (!chk.ok) {
            toast.error(chk.message);
            return;
          }
        }
        if (USE_CREDITS_API) {
          if (editingId) {
            await creditsApi.update(editingId, {
              type: form.type,
              intitule: form.intitule,
              preteur: form.preteur,
              ...creditClientTierPayload(form),
              montantTotal: Number(form.montantTotal),
              tauxInteret: Number(form.tauxInteret) || undefined,
              dateDebut: form.dateDebut,
              dateEcheance: form.dateEcheance || undefined,
              notes: form.notes || undefined,
            });
            toast.success('Crédit modifié');
          } else {
            await creditsApi.create({
              type: form.type,
              intitule: form.intitule,
              preteur: form.preteur,
              ...creditClientTierPayload(form),
              montantTotal: Number(form.montantTotal),
              tauxInteret: Number(form.tauxInteret) || undefined,
              dateDebut: form.dateDebut,
              dateEcheance: form.dateEcheance || undefined,
              notes: form.notes || undefined,
            });
            toast.success('Crédit ajouté');
          }
          await refreshCreditsFromApi();
        } else if (editingId) {
          const updated = credits.map((c) =>
            c.id === editingId
              ? {
                  ...c,
                  ...form,
                  montantTotal: Number(form.montantTotal),
                  tauxInteret: Number(form.tauxInteret) || 0,
                  clientTierId:
                    form.clientTierId !== 'none' ? form.clientTierId : undefined,
                }
              : c,
          );
          persistLocal(updated);
          toast.success('Crédit modifié');
        } else {
          const newCredit: Credit = {
            id: Date.now().toString(),
            type: form.type,
            intitule: form.intitule,
            preteur: form.preteur,
            clientTierId: form.clientTierId !== 'none' ? form.clientTierId : undefined,
            montantTotal: Number(form.montantTotal),
            tauxInteret: Number(form.tauxInteret) || 0,
            montantRembourse: 0,
            statut: 'en_cours',
            dateDebut: form.dateDebut,
            dateEcheance: form.dateEcheance || undefined,
            notes: form.notes || undefined,
            remboursements: [],
          };
          persistLocal([...credits, newCredit]);
          toast.success('Crédit ajouté');
        }
        setIsDialogOpen(false);
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur enregistrement crédit');
      }
    });
  };

  const handleEdit = (c: Credit) => {
    setEditingId(c.id);
    setForm({
      type: c.type,
      intitule: c.intitule,
      preteur: c.preteur,
      clientTierId: c.clientTierId || 'none',
      montantTotal: c.montantTotal,
      tauxInteret: c.tauxInteret || 0,
      dateDebut: c.dateDebut,
      dateEcheance: c.dateEcheance || '',
      notes: c.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce crédit ?')) return;
    try {
      if (USE_CREDITS_API) {
        await creditsApi.delete(id);
        await refreshCreditsFromApi();
      } else {
        persistLocal(credits.filter((c) => c.id !== id));
      }
      toast.success('Crédit supprimé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression');
    }
  };

  const handleAddRemboursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remboursDialogId || remboursForm.montant <= 0) return;
    const creditRow = credits.find((c) => c.id === remboursDialogId);
    if (!creditRow) return;
    const resteDu = getMontantCible(creditRow) - creditRow.montantRembourse;
    const tol = 0.01;
    if (remboursForm.montant > resteDu + tol) {
      toast.error(
        `Montant refusé : le reste dû est de ${Math.max(0, resteDu).toLocaleString('fr-FR')} FCFA.`,
      );
      return;
    }
    await withRemboursGuard(async () => {
      try {
        if (USE_CREDITS_API) {
          await creditsApi.addRemboursement(remboursDialogId, {
            date: remboursForm.date,
            montant: Number(remboursForm.montant),
            note: remboursForm.note || undefined,
          });
          await refreshCreditsFromApi();
        } else {
          const updated = credits.map((c) => {
            if (c.id !== remboursDialogId) return c;
            const newRemb: Remboursement = {
              id: Date.now().toString(),
              date: remboursForm.date,
              montant: Number(remboursForm.montant),
              note: remboursForm.note,
            };
            const totalRemb = c.montantRembourse + newRemb.montant;
            const montantCible = getMontantCible(c);
            const statut: CreditStatut =
              totalRemb >= montantCible ? 'solde' : c.statut === 'solde' ? 'en_cours' : c.statut;
            return { ...c, montantRembourse: totalRemb, statut, remboursements: [...c.remboursements, newRemb] };
          });
          persistLocal(updated);
        }
        toast.success('Remboursement enregistré');
        setRemboursDialogId(null);
        setRemboursForm({ date: new Date().toISOString().split('T')[0], montant: 0, note: '' });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur remboursement');
      }
    });
  };

  const handleExport = () => {
    exportToExcel({
      title: 'Suivi créances',
      fileName: `suivi_creances_${new Date().toISOString().split('T')[0]}.xlsx`,
      columns: [
        { header: 'Intitulé', value: (c) => c.intitule },
        { header: 'Type', value: (c) => (c.type === 'emprunt' ? 'Emprunt' : 'Commande sans paiement') },
        { header: 'Client / créancier', value: (c) => c.preteur },
        {
          header: 'Fiche client',
          value: (c) =>
            c.type === 'pret_accorde' && c.clientTierId
              ? thirdParties.find((tp) => tp.id === c.clientTierId)?.nom || c.clientTierId
              : '—',
        },
        { header: 'Montant de base (FCFA)', value: (c) => c.montantTotal },
        { header: 'Majoration %', value: (c) => c.tauxInteret ?? 0 },
        { header: 'Total dû (base + %)', value: (c) => getMontantCible(c) },
        { header: 'Montant remboursé', value: (c) => c.montantRembourse },
        { header: 'Reste', value: (c) => getMontantCible(c) - c.montantRembourse },
        { header: 'Statut', value: (c) => c.statut },
        { header: 'Date début', value: (c) => c.dateDebut },
        { header: 'Date échéance', value: (c) => c.dateEcheance || '-' },
      ],
      rows: sortedFiltered,
    });
    toast.success('Export généré');
  };

  // Backup
  const handleBackup = () => {
    const blob = new Blob([JSON.stringify({ version: '1.0', exportedAt: new Date().toISOString(), credits }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `credits-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success('Backup téléchargé');
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (USE_CREDITS_API) {
      toast.error('Restauration JSON désactivée en mode serveur (API).');
      e.target.value = '';
      return;
    }
    if (!confirm('Remplacer tous les crédits actuels ?')) { e.target.value = ''; return; }
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed.credits) throw new Error('Fichier invalide');
      persistLocal(parsed.credits);
      toast.success(`${parsed.credits.length} crédit(s) restauré(s)`);
    } catch { toast.error('Fichier invalide'); }
    e.target.value = '';
  };

  const statutBadge = (s: CreditStatut) => {
    if (s === 'solde') return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />Soldé</Badge>;
    if (s === 'en_retard') return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><AlertTriangle className="h-3 w-3 mr-1" />En retard</Badge>;
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="h-3 w-3 mr-1" />En cours</Badge>;
  };

  const creditInDialog = credits.find(c => c.id === remboursDialogId);
  const maxRemboursementMontant = creditInDialog
    ? Math.max(0, getMontantCible(creditInDialog) - creditInDialog.montantRembourse)
    : 0;

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Suivi créances"
        description={PAGE_CREDITS_DESCRIPTION}
        icon={CreditCard}
        gradient="from-rose-500/15 via-pink-500/8 to-transparent"
        iconColor="from-rose-500 via-pink-500 to-red-600"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleBackup} className="gap-2">
              <HardDrive className="h-4 w-4" />Backup
            </Button>
            <Button variant="outline" size="sm" onClick={() => restoreRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" />Restaurer
            </Button>
            <input ref={restoreRef} type="file" accept=".json" aria-label="Restaurer crédits" className="hidden" onChange={handleRestore} />
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <FileDown className="h-4 w-4" />Exporter
            </Button>
            {canManageCredits && (
              <Dialog open={isDialogOpen} onOpenChange={o => { setIsDialogOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button className="gap-2"><Plus className="h-4 w-4" />Nouvelle créance</Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingId ? 'Modifier la créance' : 'Nouvelle créance'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Type *</Label>
                        <Select
                          value={form.type}
                          onValueChange={(v) => {
                            const t = v as CreditType;
                            setForm((f) => ({
                              ...f,
                              type: t,
                              clientTierId: t === 'emprunt' ? 'none' : f.clientTierId,
                            }));
                          }}
                        >
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="emprunt">💸 Emprunt (je dois)</SelectItem>
                            <SelectItem value="pret_accorde">📦 Commande / vente sans paiement (créance client)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{form.type === 'emprunt' ? 'Montant emprunté (FCFA) *' : 'Montant dû (commande non payée, FCFA) *'}</Label>
                        <Input type="number" min="0" className="mt-1" value={form.montantTotal || ''} onChange={e => setForm({ ...form, montantTotal: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div>
                      <Label>Intitulé *</Label>
                      <Input
                        className="mt-1"
                        placeholder="Ex: Emprunt banque UBA, Commande livraison Douala n°…"
                        value={form.intitule}
                        onChange={e => setForm({ ...form, intitule: e.target.value })}
                      />
                    </div>
                    {form.type === 'pret_accorde' && (
                      <div>
                        <Label>Fiche client</Label>
                        <ThirdPartyPicker
                          className="mt-1"
                          options={tierClientsFiches}
                          value={form.clientTierId}
                          onValueChange={(id) => {
                            if (id === 'none') {
                              setForm((f) => ({ ...f, clientTierId: 'none' }));
                              return;
                            }
                            const tp = thirdParties.find((t) => t.id === id && t.type === 'client');
                            if (tp) {
                              setForm((f) => ({ ...f, clientTierId: id, preteur: tp.nom }));
                            }
                          }}
                          placeholder="Rechercher une fiche client…"
                          searchPlaceholder="Nom, téléphone…"
                          topChoices={[
                            {
                              id: 'none',
                              label: 'Sans rattachement (texte libre)',
                              keywords: 'sans libre',
                            },
                          ]}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Indispensable pour le plafond : la commande est liée à la fiche client par son identifiant, pas seulement par le nom saisi ci‑dessous.
                        </p>
                      </div>
                    )}
                    <div>
                      <Label>{form.type === 'emprunt' ? 'Prêteur / Créancier *' : 'Client (commande non payée) *'}</Label>
                      <Input
                        className="mt-1"
                        placeholder={form.type === 'emprunt' ? 'Banque ou créancier' : 'Raison sociale ou contact client'}
                        value={form.preteur}
                        onChange={e => setForm({ ...form, preteur: e.target.value })}
                      />
                      {clientPlafondApercu && (
                        <Alert
                          variant={clientPlafondApercu.depasse ? 'destructive' : 'default'}
                          className={cn(
                            'mt-2',
                            !clientPlafondApercu.depasse &&
                              'border-emerald-200/80 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-900/50',
                          )}
                        >
                          <Info className="h-4 w-4" />
                          <AlertDescription className="text-xs sm:text-sm">
                            <span className="font-medium">Plafond « {clientPlafondApercu.clientNom} » :</span>{' '}
                            {Math.round(clientPlafondApercu.plafond).toLocaleString('fr-FR')} FCFA — encours actuel{' '}
                            {Math.round(clientPlafondApercu.encours).toLocaleString('fr-FR')} FCFA — disponible{' '}
                            {Math.round(clientPlafondApercu.disponible).toLocaleString('fr-FR')} FCFA.
                            {clientPlafondApercu.nouveau > 0 && (
                              <> Nouvelle ligne (montant total dû, pénalités % incluses si renseignées) : {Math.round(clientPlafondApercu.nouveau).toLocaleString('fr-FR')} FCFA.</>
                            )}
                            {clientPlafondApercu.depasse && (
                              <span className="block mt-1 font-semibold">Dépassement du plafond : enregistrement refusé.</span>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label>{form.type === 'emprunt' ? "Taux d'intérêt (%)" : 'Majoration / pénalités (%) — optionnel'}</Label>
                        <Input type="number" min="0" step="0.1" className="mt-1" value={form.tauxInteret || ''} onChange={e => setForm({ ...form, tauxInteret: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label>Date début *</Label>
                        <Input type="date" className="mt-1" value={form.dateDebut} onChange={e => setForm({ ...form, dateDebut: e.target.value })} />
                      </div>
                      <div>
                        <Label>Date échéance</Label>
                        <Input type="date" className="mt-1" value={form.dateEcheance} onChange={e => setForm({ ...form, dateEcheance: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input className="mt-1" placeholder="Remarques..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button type="submit" className="flex-1" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</>
                        ) : (
                          editingId ? 'Modifier' : 'Ajouter'
                        )}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }} disabled={isSubmitting}>Annuler</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <Alert className="border-rose-200/80 bg-rose-50/60 dark:bg-rose-950/25 dark:border-rose-900/40">
        <Info className="h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" />
        <AlertDescription className="text-sm text-foreground/90">
          <span className="font-semibold">Registre autonome.</span> Les montants et remboursements enregistrés ici sont uniquement
          informatifs pour suivre vos dettes et créances. Ils n’alimentent pas la caisse, la banque, les factures ni les indicateurs
          financiers des autres écrans. Pour les <span className="font-medium">commandes sans paiement</span>, rattachez la <span className="font-medium">fiche client</span> afin d’appliquer le plafond d’encours. Pour un mouvement d’argent réel, passez aussi par la{' '}
          <span className="font-medium">Caisse</span> ou <span className="font-medium">Banque</span> si besoin.
        </AlertDescription>
      </Alert>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Emprunts actifs</p>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{emprunts.filter(c => c.statut === 'en_cours').length}</p>
            <p className="text-xs text-muted-foreground mt-1">Dû : {totalDu.toLocaleString('fr-FR')} FCFA</p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Créances clients</p>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{prets.filter(c => c.statut === 'en_cours').length}</p>
            <p className="text-xs text-muted-foreground mt-1">Commandes non payées : {totalARecevoir.toLocaleString('fr-FR')} FCFA</p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">En retard</p>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </div>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{enRetard}</p>
            <p className="text-xs text-muted-foreground mt-1">Échéance dépassée</p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Soldés</p>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{credits.filter(c => c.statut === 'solde').length}</p>
            <p className="text-xs text-muted-foreground mt-1">Remboursés</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Tous types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="emprunt">💸 Emprunts</SelectItem>
            <SelectItem value="pret_accorde">📦 Créances clients (sans paiement)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Tous statuts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="en_retard">En retard</SelectItem>
            <SelectItem value="solde">Soldé</SelectItem>
          </SelectContent>
        </Select>
        <ListSortSelect
          id="sort-credits"
          value={listSort}
          onChange={setListSort}
          options={[...CREDIT_SORT_OPTIONS]}
          className="min-w-[220px]"
        />
      </div>

      {/* Tableau */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="border-b bg-muted/20 py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Suivi créances
            <Badge variant="secondary" className="ml-2">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Banknote className="h-10 w-10 opacity-30" />
              <p className="text-sm">Aucune ligne de créance enregistrée</p>
              {canManageCredits && <Button size="sm" onClick={() => setIsDialogOpen(true)} className="gap-2 mt-2"><Plus className="h-4 w-4" />Ajouter une ligne</Button>}
            </div>
          ) : (
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Intitulé</TableHead>
                    <TableHead className="min-w-[120px]">Type</TableHead>
                    <TableHead className="min-w-[140px]">Client / créancier</TableHead>
                    <TableHead className="min-w-[200px]">Progression</TableHead>
                    <TableHead className="min-w-[100px]">Échéance</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right min-w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFiltered.map(c => {
                    const montantCible = getMontantCible(c);
                    const restant = montantCible - c.montantRembourse;
                    const pct = montantCible > 0 ? Math.min(100, (c.montantRembourse / montantCible) * 100) : 0;
                    const isRetard = c.dateEcheance && c.statut !== 'solde' && new Date(c.dateEcheance) < new Date();
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div>
                            <p className="font-semibold text-sm">{c.intitule}</p>
                            {c.tauxInteret ? (
                              <p className="text-xs text-muted-foreground">
                                {c.type === 'emprunt' ? `Taux : ${c.tauxInteret}%` : `Majoration : ${c.tauxInteret}%`}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', c.type === 'emprunt' ? 'border-red-300 text-red-600 dark:text-red-400' : 'border-green-300 text-green-600 dark:text-green-400')}>
                            {c.type === 'emprunt' ? '💸 Emprunt' : '📦 Créance client'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{c.preteur}</TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[160px]">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{c.montantRembourse.toLocaleString('fr-FR')} FCFA</span>
                              <span>{montantCible.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                            <p className="text-xs text-muted-foreground">Restant : {restant.toLocaleString('fr-FR')} FCFA ({pct.toFixed(0)}%)</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.dateEcheance ? (
                            <div className={cn('flex items-center gap-1 text-xs', isRetard ? 'text-red-500' : 'text-muted-foreground')}>
                              <Calendar className="h-3 w-3" />
                              {new Date(c.dateEcheance).toLocaleDateString('fr-FR')}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>{statutBadge(c.statut)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.statut !== 'solde' && canManageCredits && (
                              <Button size="sm" variant="outline" className="gap-1 text-xs h-8 border-green-300 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                                onClick={() => { setRemboursDialogId(c.id); setRemboursForm({ date: new Date().toISOString().split('T')[0], montant: 0, note: '' }); }}>
                                <RotateCcw className="h-3 w-3" />Rembours.
                              </Button>
                            )}
                            {canManageCredits && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(c)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canManageCredits && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog remboursement */}
      <Dialog open={!!remboursDialogId} onOpenChange={o => { if (!o) setRemboursDialogId(null); }}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-green-500" />
              Enregistrer un remboursement
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 mb-1">
            Ce remboursement met à jour uniquement ce registre crédits, pas la caisse ni la banque.
          </p>
          {creditInDialog && (
            <div className="mb-4 p-3 bg-muted/40 rounded-xl text-sm space-y-1">
              <p className="font-semibold">{creditInDialog.intitule}</p>
              <p className="text-muted-foreground">Restant dû : <span className="font-semibold text-foreground">{(getMontantCible(creditInDialog) - creditInDialog.montantRembourse).toLocaleString('fr-FR')} FCFA</span></p>
            </div>
          )}
          <form onSubmit={handleAddRemboursement} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rembours-montant">Montant (FCFA) *</Label>
                <NumberInput
                  id="rembours-montant"
                  className="mt-1"
                  value={remboursForm.montant}
                  onChange={(value) => setRemboursForm({ ...remboursForm, montant: value || 0 })}
                  min={0}
                  max={maxRemboursementMontant > 0 ? maxRemboursementMontant : undefined}
                  placeholder="0"
                />
                {maxRemboursementMontant > 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum : {maxRemboursementMontant.toLocaleString('fr-FR')} FCFA
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" className="mt-1" value={remboursForm.date} onChange={e => setRemboursForm({ ...remboursForm, date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Input className="mt-1" placeholder="Ex: virement, espèces..." value={remboursForm.note} onChange={e => setRemboursForm({ ...remboursForm, note: e.target.value })} />
            </div>
            {/* Historique */}
            {creditInDialog?.remboursements.length ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Historique</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {creditInDialog.remboursements.slice().reverse().map(r => (
                    <div key={r.id} className="flex justify-between text-xs bg-muted/40 px-3 py-1.5 rounded-lg">
                      <span className="text-muted-foreground">{new Date(r.date).toLocaleDateString('fr-FR')}{r.note ? ` · ${r.note}` : ''}</span>
                      <span className="font-semibold text-green-600">+{r.montant.toLocaleString('fr-FR')} FCFA</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1 gap-2" disabled={isRemboursSubmitting || remboursForm.montant <= 0 || remboursForm.montant > maxRemboursementMontant + 0.01}>
                {isRemboursSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Enregistrement...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" />Enregistrer</>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setRemboursDialogId(null)}>Annuler</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
