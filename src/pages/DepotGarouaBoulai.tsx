/** Dépôt ciment Garoua-Boulai (safe house) : bons, marchandise et mouvements camion. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import { ExportButtons } from '@/components/ExportButtons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ListSortSelect } from '@/components/ListSortSelect';
import {
  Warehouse,
  Plus,
  Edit,
  Trash2,
  Search,
  TrendingUp,
  TrendingDown,
  Package,
  Loader2,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { truckMissionLabel } from '@/lib/trip-mission-context';
import { formatLoadingEntryModeFr } from '@/lib/hub-transit';
import { SUPPLIER_LOADING_STATUS_OPTIONS, formatSupplierLoadingStatusFr } from '@/lib/supplier-loadings';
import {
  type DepotGarouaMovement,
  type DepotGarouaMovementType,
  computeDepotStockFromMovements,
  createDepotGarouaMovement,
  deleteDepotGarouaMovement,
  formatDepotGarouaTypeFr,
  previewDepotStockFinal,
  refreshDepotGarouaFromApi,
  summarizeGarouaBoulaiLoadings,
  updateDepotGarouaMovement,
} from '@/lib/depot-garoua-boulai';

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (récent → ancien)' },
  { value: 'date_asc', label: 'Date (ancien → récent)' },
  { value: 'stock_desc', label: 'Stock final (plus haut → plus bas)' },
  { value: 'quantite_desc', label: 'Quantité (plus haute → plus basse)' },
] as const;

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Tous les mouvements' },
  { value: 'entree', label: 'Entrées ciment' },
  { value: 'retrait', label: 'Retraits ciment' },
] as const;

const BON_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date bon (récent → ancien)' },
  { value: 'reste_desc', label: 'Reste au dépôt (plus haut → plus bas)' },
  { value: 'designation_asc', label: 'Désignation A → Z' },
] as const;

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export default function DepotGarouaBoulai() {
  const { trucks, supplierLoadings, refreshSupplierLoadings } = useApp();
  const { user } = useAuth();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [movements, setMovements] = useState<DepotGarouaMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DepotGarouaMovement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [listSort, setListSort] = useState<string>('date_desc');
  const [bonSearch, setBonSearch] = useState('');
  const [bonFilterStatut, setBonFilterStatut] = useState<string>('all');
  const [bonSort, setBonSort] = useState<string>('date_desc');
  const [bonResteOnly, setBonResteOnly] = useState(true);

  const [form, setForm] = useState({
    date: todayIso(),
    truckId: '',
    type: 'entree' as DepotGarouaMovementType,
    quantite: undefined as number | undefined,
    supplierLoadingId: '',
    notes: '',
  });

  const activeTrucks = useMemo(
    () =>
      stableSort(
        trucks.filter((t) => t.statut === 'actif'),
        (a, b) => frCollator.compare(truckMissionLabel(a), truckMissionLabel(b)),
      ),
    [trucks],
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const rows = await refreshDepotGarouaFromApi();
      await refreshSupplierLoadings();
      setMovements(rows);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de charger le dépôt Garoua-Boulai.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const bonSummary = useMemo(
    () => summarizeGarouaBoulaiLoadings(supplierLoadings),
    [supplierLoadings],
  );

  const filteredBons = useMemo(() => {
    const q = bonSearch.trim().toLowerCase();
    let list = [...bonSummary.rows];
    if (bonFilterStatut !== 'all') {
      list = list.filter((l) => l.statut === bonFilterStatut);
    }
    if (bonResteOnly) {
      list = list.filter(
        (l) => l.resteAuDepot == null || l.resteAuDepot > 1e-6,
      );
    }
    if (q) {
      list = list.filter(
        (l) =>
          l.designation.toLowerCase().includes(q) ||
          (l.numeroBon ?? '').toLowerCase().includes(q) ||
          (l.fournisseurNom ?? '').toLowerCase().includes(q) ||
          (l.lieu ?? '').toLowerCase().includes(q) ||
          (l.hubArrivee ?? '').toLowerCase().includes(q),
      );
    }
    switch (bonSort) {
      case 'reste_desc':
        return stableSort(list, (a, b) => (b.resteAuDepot ?? 0) - (a.resteAuDepot ?? 0));
      case 'designation_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.designation, b.designation));
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => frCollator.compare(b.dateChargement, a.dateChargement));
    }
  }, [bonSummary.rows, bonSearch, bonFilterStatut, bonSort, bonResteOnly]);

  const currentStock = useMemo(() => computeDepotStockFromMovements(movements), [movements]);

  const previewStockFinal = useMemo(() => {
    const q = form.quantite ?? 0;
    if (!Number.isFinite(q) || q <= 0) return currentStock;
    return previewDepotStockFinal(
      movements,
      { type: form.type, quantite: q },
      editing?.id,
    );
  }, [movements, form.type, form.quantite, editing?.id, currentStock]);

  const stats = useMemo(() => {
    const entrees = movements.filter((m) => m.type === 'entree');
    const retraits = movements.filter((m) => m.type === 'retrait');
    return {
      count: movements.length,
      stockMouvements: currentStock,
      stockBons: bonSummary.stockReste,
      bonsCount: bonSummary.count,
      bonsEnAttente: bonSummary.enAttente,
      totalEntrees: entrees.reduce((s, m) => s + m.quantite, 0),
      totalRetraits: retraits.reduce((s, m) => s + m.quantite, 0),
    };
  }, [movements, currentStock, bonSummary]);

  const filteredMovements = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return movements.filter((m) => {
      if (filterType !== 'all' && m.type !== filterType) return false;
      if (!q) return true;
      const truck = trucks.find((t) => t.id === m.truckId);
      const immat =
        m.camionImmatriculation?.toLowerCase() ||
        truckMissionLabel(truck).toLowerCase();
      return (
        immat.includes(q) ||
        formatDepotGarouaTypeFr(m.type).toLowerCase().includes(q) ||
        (m.notes ?? '').toLowerCase().includes(q) ||
        String(m.quantite).includes(q) ||
        String(m.stockFinal).includes(q)
      );
    });
  }, [movements, filterType, searchTerm, trucks]);

  const sortedMovements = useMemo(() => {
    const list = [...filteredMovements];
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.date) - parseDateMs(b.date));
      case 'stock_desc':
        return stableSort(list, (a, b) => b.stockFinal - a.stockFinal);
      case 'quantite_desc':
        return stableSort(list, (a, b) => b.quantite - a.quantite);
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.date) - parseDateMs(a.date));
    }
  }, [filteredMovements, listSort]);

  const truckLabel = (m: DepotGarouaMovement) => {
    if (m.camionImmatriculation?.trim()) return m.camionImmatriculation.trim();
    const truck = trucks.find((t) => t.id === m.truckId);
    return truck ? truckMissionLabel(truck) : '—';
  };

  const resetForm = () => {
    setForm({
      date: todayIso(),
      truckId: '',
      type: 'entree',
      quantite: undefined,
      supplierLoadingId: '',
      notes: '',
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (m: DepotGarouaMovement) => {
    setEditing(m);
    setForm({
      date: m.date.split('T')[0] || m.date,
      truckId: m.truckId || '',
      type: m.type,
      quantite: m.quantite,
      notes: m.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(form.quantite);
    if (!form.date) {
      toast.error('Indiquez la date du mouvement.');
      return;
    }
    if (!form.truckId) {
      toast.error('Choisissez le camion concerné.');
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      toast.error('Indiquez une quantité valide.');
      return;
    }
    if (previewStockFinal < -1e-9) {
      toast.error('Stock dépôt insuffisant pour ce retrait.');
      return;
    }

    const truck = trucks.find((t) => t.id === form.truckId);
    const linkedBon = form.supplierLoadingId
      ? bonSummary.rows.find((b) => b.id === form.supplierLoadingId)
      : undefined;
    const bonNote = linkedBon
      ? `Bon ${linkedBon.numeroBon?.trim() || linkedBon.designation}`
      : '';
    const payload = {
      date: form.date,
      truckId: form.truckId,
      camionImmatriculation: truck ? truckMissionLabel(truck) : undefined,
      type: form.type,
      quantite: q,
      notes: [bonNote, form.notes.trim()].filter(Boolean).join(' · ') || undefined,
      utilisateur: user?.login || 'system',
    };

    await withGuard(async () => {
      try {
        if (editing) {
          await updateDepotGarouaMovement(editing.id, payload);
          toast.success('Mouvement mis à jour.');
        } else {
          await createDepotGarouaMovement(payload);
          toast.success('Mouvement enregistré.');
        }
        await loadAll();
        setDialogOpen(false);
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur enregistrement.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce mouvement de dépôt ?')) return;
    try {
      await deleteDepotGarouaMovement(id);
      await loadAll();
      toast.success('Mouvement supprimé.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression.');
    }
  };

  const truckLabelForBon = (camionId?: string) => {
    if (!camionId) return '—';
    const truck = trucks.find((t) => t.id === camionId);
    return truck ? truckMissionLabel(truck) : '—';
  };

  const exportColumns = [
    { header: 'Date', value: (m: DepotGarouaMovement) => new Date(m.date).toLocaleDateString('fr-FR') },
    { header: 'Camion', value: truckLabel },
    { header: 'Type', value: (m: DepotGarouaMovement) => formatDepotGarouaTypeFr(m.type) },
    { header: 'Quantité', value: (m: DepotGarouaMovement) => m.quantite },
    { header: 'Stock final', value: (m: DepotGarouaMovement) => m.stockFinal },
    { header: 'Notes', value: (m: DepotGarouaMovement) => m.notes || '' },
    { header: 'Utilisateur', value: (m: DepotGarouaMovement) => m.utilisateur || 'Système' },
  ];

  const bonExportColumns = [
    {
      header: 'N° bon',
      value: (l: (typeof filteredBons)[number]) => l.numeroBon || '—',
    },
    { header: 'Fournisseur', value: (l: (typeof filteredBons)[number]) => l.fournisseurNom || '—' },
    { header: 'Désignation', value: (l: (typeof filteredBons)[number]) => l.designation },
    {
      header: 'Quantité bon',
      value: (l: (typeof filteredBons)[number]) =>
        l.quantite != null ? `${l.quantite}${l.unite ? ` ${l.unite}` : ''}` : '—',
    },
    {
      header: 'Reste au dépôt',
      value: (l: (typeof filteredBons)[number]) =>
        l.resteAuDepot != null ? `${l.resteAuDepot}${l.unite ? ` ${l.unite}` : ''}` : '—',
    },
    {
      header: 'Statut',
      value: (l: (typeof filteredBons)[number]) => formatSupplierLoadingStatusFr(l.statut),
    },
    {
      header: 'Mode',
      value: (l: (typeof filteredBons)[number]) => formatLoadingEntryModeFr(l.modeEntree),
    },
    { header: 'Camion', value: (l: (typeof filteredBons)[number]) => truckLabelForBon(l.camionId) },
    {
      header: 'Date bon',
      value: (l: (typeof filteredBons)[number]) =>
        new Date(l.dateChargement).toLocaleDateString('fr-FR'),
    },
    {
      header: 'Arrivée dépôt',
      value: (l: (typeof filteredBons)[number]) =>
        l.dateArriveeHub
          ? new Date(l.dateArriveeHub).toLocaleDateString('fr-FR')
          : '—',
    },
  ];

  const exportFilters =
    filterType !== 'all'
      ? `Type: ${TYPE_FILTER_OPTIONS.find((o) => o.value === filterType)?.label ?? filterType}`
      : undefined;

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Dépôt Garoua-Boulai"
        icon={Warehouse}
        gradient="from-amber-500/20 via-orange-500/10 to-transparent"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              onExcel={() =>
                exportToExcel({
                  title: 'Dépôt Garoua-Boulai',
                  fileName: `depot_garoua_boulai_${todayIso()}.xlsx`,
                  filtersDescription: exportFilters,
                  columns: exportColumns,
                  rows: sortedMovements,
                })
              }
              onPdf={() =>
                exportToPrintablePDF({
                  title: 'Dépôt Garoua-Boulai',
                  fileName: `depot_garoua_boulai_${todayIso()}.pdf`,
                  filtersDescription: exportFilters,
                  headerColor: '#d97706',
                  headerTextColor: '#ffffff',
                  evenRowColor: '#fffbeb',
                  oddRowColor: '#ffffff',
                  accentColor: '#d97706',
                  totals: [
                    {
                      label: 'Stock bons (reste)',
                      value: `${stats.stockBons.toLocaleString('fr-FR')} sacs/unités`,
                      style: 'positive',
                    },
                    {
                      label: 'Stock mouvements camion',
                      value: `${stats.stockMouvements.toLocaleString('fr-FR')}`,
                      style: 'neutral',
                    },
                    {
                      label: 'Bons au dépôt',
                      value: `${stats.bonsCount}`,
                      style: 'neutral',
                    },
                  ],
                  columns: exportColumns,
                  rows: sortedMovements,
                })
              }
            />
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nouveau
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editing ? 'Modifier le mouvement' : 'Nouveau mouvement dépôt'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="depot-date">Date *</Label>
                    <Input
                      id="depot-date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <Label>Camion (immatriculation) *</Label>
                    <Select
                      value={form.truckId}
                      onValueChange={(truckId) => setForm((f) => ({ ...f, truckId }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un camion" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeTrucks.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground">
                            Aucun camion actif disponible.
                          </div>
                        ) : (
                          activeTrucks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {truckMissionLabel(t)} · {t.modele}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Type de mouvement *</Label>
                      <Select
                        value={form.type}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, type: v as DepotGarouaMovementType }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entree">Entrée ciment</SelectItem>
                          <SelectItem value="retrait">Retrait ciment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="depot-qty">Quantité *</Label>
                      <NumberInput
                        id="depot-qty"
                        value={form.quantite}
                        onChange={(quantite) => setForm((f) => ({ ...f, quantite }))}
                        min={0}
                        allowEmpty
                        placeholder="Ex. 200"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-xs text-muted-foreground">Stock final après mouvement</p>
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        previewStockFinal < 0 ? 'text-red-600' : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {previewStockFinal.toLocaleString('fr-FR')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Stock mouvements : {currentStock.toLocaleString('fr-FR')} · Stock bons :{' '}
                      {stats.stockBons.toLocaleString('fr-FR')}
                    </p>
                  </div>

                  <div>
                    <Label>Bon / marchandise liée (optionnel)</Label>
                    <Select
                      value={form.supplierLoadingId || '__none__'}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          supplierLoadingId: v === '__none__' ? '' : v,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Rattacher à un bon au dépôt" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Aucun bon</SelectItem>
                        {bonSummary.rows.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {(b.numeroBon ? `Bon ${b.numeroBon} · ` : '') +
                              b.designation +
                              (b.resteAuDepot != null
                                ? ` · reste ${b.resteAuDepot}${b.unite ? ` ${b.unite}` : ''}`
                                : '')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="depot-notes">Notes (optionnel)</Label>
                    <Input
                      id="depot-notes"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Référence bon, client, commentaire…"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={isSubmitting}
                    >
                      Annuler
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enregistrement…
                        </>
                      ) : editing ? (
                        'Modifier'
                      ) : (
                        'Enregistrer'
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Stock bons (reste)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
              {stats.stockBons.toLocaleString('fr-FR')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.bonsCount} bon(s) · {stats.bonsEnAttente} avec reste
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-600" />
              Stock mouvements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {stats.stockMouvements.toLocaleString('fr-FR')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Entrées / retraits camion</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Entrées cumulées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600 tabular-nums">
              +{stats.totalEntrees.toLocaleString('fr-FR')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Retraits cumulés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600 tabular-nums">
              −{stats.totalRetraits.toLocaleString('fr-FR')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Mouvements camion</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{stats.count}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-500/20">
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-amber-600" />
                  État des bons et marchandise
                </CardTitle>
                <p className="text-sm text-muted-foreground font-normal mt-1">
                  Bons de chargement dont le hub ou le lieu est{' '}
                  <strong className="text-foreground">Garoua-Boulai</strong>. Renseignez ce lieu
                  dans{' '}
                  <Link to="/chargements" className="underline underline-offset-2 text-primary">
                    Chargements
                  </Link>{' '}
                  pour les voir ici.
                </p>
              </div>
              <ExportButtons
                size="sm"
                onExcel={() =>
                  exportToExcel({
                    title: 'Bons Garoua-Boulai',
                    fileName: `depot_garoua_boulai_bons_${todayIso()}.xlsx`,
                    columns: bonExportColumns,
                    rows: filteredBons,
                  })
                }
                onPdf={() =>
                  exportToPrintablePDF({
                    title: 'Bons et marchandise — Garoua-Boulai',
                    fileName: `depot_garoua_boulai_bons_${todayIso()}.pdf`,
                    headerColor: '#d97706',
                    headerTextColor: '#ffffff',
                    evenRowColor: '#fffbeb',
                    oddRowColor: '#ffffff',
                    accentColor: '#d97706',
                    totals: [
                      {
                        label: 'Stock reste au dépôt',
                        value: `${stats.stockBons.toLocaleString('fr-FR')}`,
                        style: 'positive',
                      },
                      {
                        label: 'Nombre de bons',
                        value: `${filteredBons.length} / ${stats.bonsCount}`,
                        style: 'neutral',
                      },
                    ],
                    columns: bonExportColumns,
                    rows: filteredBons,
                  })
                }
              />
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Bon, fournisseur, désignation…"
                  value={bonSearch}
                  onChange={(e) => setBonSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={bonFilterStatut} onValueChange={setBonFilterStatut}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {SUPPLIER_LOADING_STATUS_OPTIONS.filter((s) => s !== 'annule').map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatSupplierLoadingStatusFr(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ListSortSelect
                id="sort-depot-bons"
                value={bonSort}
                onChange={setBonSort}
                options={[...BON_SORT_OPTIONS]}
                className="w-full sm:min-w-[220px] sm:w-auto"
              />
              <label className="flex items-center gap-2 text-sm px-2 py-2 rounded-md border bg-muted/20">
                <Checkbox
                  checked={bonResteOnly}
                  onCheckedChange={(c) => setBonResteOnly(c === true)}
                />
                Avec reste au dépôt
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>N° bon</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead className="text-right">Qté bon</TableHead>
                <TableHead className="text-right">Reste dépôt</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Camion</TableHead>
                <TableHead>Date bon</TableHead>
                <TableHead>Arrivée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    {bonSummary.count === 0 ? (
                      <span>
                        Aucun bon localisé à Garoua-Boulai. Créez ou modifiez un bon dans{' '}
                        <Link to="/chargements" className="underline text-primary">
                          Chargements
                        </Link>{' '}
                        avec hub / lieu « Garoua-Boulai ».
                      </span>
                    ) : (
                      'Aucun bon ne correspond aux filtres.'
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredBons.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">
                      {l.numeroBon?.trim() || '—'}
                    </TableCell>
                    <TableCell>{l.fournisseurNom || '—'}</TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">{l.designation}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.quantite != null
                        ? `${l.quantite.toLocaleString('fr-FR')}${l.unite ? ` ${l.unite}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                      {l.resteAuDepot != null
                        ? `${l.resteAuDepot.toLocaleString('fr-FR')}${l.unite ? ` ${l.unite}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-[11px]">
                        {formatSupplierLoadingStatusFr(l.statut)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatLoadingEntryModeFr(l.modeEntree)}
                    </TableCell>
                    <TableCell className="text-sm">{truckLabelForBon(l.camionId)}</TableCell>
                    <TableCell>
                      {new Date(l.dateChargement).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      {l.dateArriveeHub
                        ? new Date(l.dateArriveeHub).toLocaleDateString('fr-FR')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Journal des mouvements camion</CardTitle>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher camion, notes…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ListSortSelect
                id="sort-depot-gb"
                value={listSort}
                onChange={setListSort}
                options={[...SORT_OPTIONS]}
                className="w-full sm:min-w-[200px] sm:w-auto"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement…
            </div>
          ) : (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Camion</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Stock final</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      <Warehouse className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      {movements.length === 0
                        ? 'Aucun mouvement. Cliquez sur Nouveau pour enregistrer une entrée ou un retrait.'
                        : 'Aucun mouvement ne correspond aux filtres.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{new Date(m.date).toLocaleDateString('fr-FR')}</TableCell>
                      <TableCell className="font-medium">{truckLabel(m)}</TableCell>
                      <TableCell>
                        <Badge variant={m.type === 'entree' ? 'default' : 'secondary'}>
                          {formatDepotGarouaTypeFr(m.type)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums ${
                          m.type === 'entree'
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {m.type === 'entree' ? '+' : '−'}
                        {m.quantite.toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {m.stockFinal.toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {m.notes || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => void handleDelete(m.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
