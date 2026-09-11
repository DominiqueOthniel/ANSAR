/** Registre opérations TJK : camions partenaires hors flotte Ansar. */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, type SupplierLoading } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import { ExportButtons } from '@/components/ExportButtons';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
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
import { ClipboardList, Plus, Edit, Trash2, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { normalizeLoadingEntryMode } from '@/lib/hub-transit';
import {
  type TjkOperation,
  createTjkOperation,
  deleteTjkOperation,
  formatTjkCamionLabel,
  formatTjkClientLabel,
  refreshTjkOperationsFromApi,
  updateTjkOperation,
} from '@/lib/tjk-operations';

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (récent → ancien)' },
  { value: 'date_asc', label: 'Date (ancien → récent)' },
  { value: 'client_asc', label: 'Client A → Z' },
  { value: 'quantite_desc', label: 'Quantité (plus haute → plus basse)' },
] as const;

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function isTjkLoading(l: SupplierLoading): boolean {
  return normalizeLoadingEntryMode(l.modeEntree) === 'tjk' && l.statut !== 'annule';
}

function ventilatedQtyForLoading(
  loadingId: string,
  operations: TjkOperation[],
  excludeOpId?: string,
): number {
  return operations
    .filter((op) => op.supplierLoadingId === loadingId && op.id !== excludeOpId)
    .reduce((s, op) => s + (Number(op.quantite) || 0), 0);
}

type FormState = {
  date: string;
  clientId: string;
  clientNom: string;
  quantite: number | undefined;
  unite: string;
  qualite: string;
  destination: string;
  camionNom: string;
  camionImmatriculation: string;
  referenceAtc: string;
  supplierLoadingId: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  date: todayIso(),
  clientId: '',
  clientNom: '',
  quantite: undefined,
  unite: '',
  qualite: '',
  destination: '',
  camionNom: '',
  camionImmatriculation: '',
  referenceAtc: '',
  supplierLoadingId: '',
  notes: '',
});

export default function Tjk() {
  const { thirdParties, merchandiseQualities, supplierLoadings } = useApp();
  const { user, canManageFleet } = useAuth();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [operations, setOperations] = useState<TjkOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TjkOperation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [listSort, setListSort] = useState<string>('date_desc');
  const [form, setForm] = useState<FormState>(emptyForm);

  const clients = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'client' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const sortedQualities = useMemo(
    () =>
      stableSort([...merchandiseQualities], (a, b) =>
        frCollator.compare(a.libelle, b.libelle),
      ),
    [merchandiseQualities],
  );

  const tjkLoadings = useMemo(
    () =>
      stableSort(
        supplierLoadings.filter(isTjkLoading),
        (a, b) => parseDateMs(b.dateChargement) - parseDateMs(a.dateChargement),
      ),
    [supplierLoadings],
  );

  const pendingTjkBons = useMemo(() => {
    return tjkLoadings
      .map((l) => {
        const total = Number(l.quantite) || 0;
        const used = ventilatedQtyForLoading(l.id, operations);
        const reste = Math.max(0, total - used);
        return { loading: l, total, used, reste };
      })
      .filter((row) => row.total <= 0 || row.reste > 0);
  }, [tjkLoadings, operations]);

  const applyBonToForm = (loadingId: string, prev: FormState): FormState => {
    if (!loadingId) return { ...prev, supplierLoadingId: '' };
    const bon = tjkLoadings.find((l) => l.id === loadingId);
    if (!bon) return { ...prev, supplierLoadingId: loadingId };
    const used = ventilatedQtyForLoading(loadingId, operations, editing?.id);
    const reste =
      bon.quantite != null && bon.quantite > 0
        ? Math.max(0, bon.quantite - used)
        : undefined;
    return {
      ...prev,
      supplierLoadingId: loadingId,
      referenceAtc: bon.numeroBon?.trim() || prev.referenceAtc,
      qualite: bon.designation?.trim() || prev.qualite,
      unite: bon.unite?.trim() || prev.unite,
      quantite:
        prev.quantite != null && prev.quantite > 0
          ? prev.quantite
          : reste != null && reste > 0
            ? reste
            : prev.quantite,
      date: bon.dateChargement || prev.date,
    };
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const rows = await refreshTjkOperationsFromApi();
      setOperations(rows);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de charger les opérations TJK.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return operations.filter((op) => {
      const d = op.date.split('T')[0];
      if (filterDateFrom && (!d || d < filterDateFrom)) return false;
      if (filterDateTo && (!d || d > filterDateTo)) return false;
      if (!q) return true;
      return (
        formatTjkClientLabel(op).toLowerCase().includes(q) ||
        formatTjkCamionLabel(op).toLowerCase().includes(q) ||
        (op.destination ?? '').toLowerCase().includes(q) ||
        (op.qualite ?? '').toLowerCase().includes(q) ||
        (op.referenceAtc ?? '').toLowerCase().includes(q) ||
        (op.notes ?? '').toLowerCase().includes(q) ||
        String(op.quantite).includes(q)
      );
    });
  }, [operations, searchTerm, filterDateFrom, filterDateTo]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.date) - parseDateMs(b.date));
      case 'client_asc':
        return stableSort(list, (a, b) =>
          frCollator.compare(formatTjkClientLabel(a), formatTjkClientLabel(b)),
        );
      case 'quantite_desc':
        return stableSort(list, (a, b) => b.quantite - a.quantite);
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.date) - parseDateMs(a.date));
    }
  }, [filtered, listSort]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openVentiler = (loadingId: string) => {
    setEditing(null);
    setForm(applyBonToForm(loadingId, emptyForm()));
    setDialogOpen(true);
  };

  const openEdit = (op: TjkOperation) => {
    setEditing(op);
    setForm({
      date: op.date.split('T')[0] || op.date,
      clientId: op.clientId || '',
      clientNom: op.clientNom || '',
      quantite: op.quantite,
      unite: op.unite || '',
      qualite: op.qualite || '',
      destination: op.destination || '',
      camionNom: op.camionNom || '',
      camionImmatriculation: op.camionImmatriculation || '',
      referenceAtc: op.referenceAtc || '',
      supplierLoadingId: op.supplierLoadingId || '',
      notes: op.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(form.quantite);
    if (!form.date) {
      toast.error('Indiquez la date de l’opération.');
      return;
    }
    const clientNom = form.clientNom.trim();
    if (!form.clientId && !clientNom) {
      toast.error('Indiquez un client (fiche ou nom libre).');
      return;
    }
    if (!Number.isFinite(q) || q < 0) {
      toast.error('Indiquez une quantité valide.');
      return;
    }
    if (!form.destination.trim()) {
      toast.error('Indiquez la destination.');
      return;
    }
    if (form.supplierLoadingId) {
      const bon = tjkLoadings.find((l) => l.id === form.supplierLoadingId);
      if (bon?.quantite != null && bon.quantite > 0) {
        const used = ventilatedQtyForLoading(
          form.supplierLoadingId,
          operations,
          editing?.id,
        );
        if (used + q > bon.quantite + 1e-6) {
          toast.error(
            `Quantité trop élevée : reste ${Math.max(0, bon.quantite - used).toLocaleString('fr-FR')} sur ce bon TJK.`,
          );
          return;
        }
      }
    }
    if (!form.camionNom.trim() && !form.camionImmatriculation.trim()) {
      toast.warning('Camion non renseigné (nom ou immatriculation recommandé).');
    }

    const selectedClient = clients.find((c) => c.id === form.clientId);
    const payload = {
      date: form.date,
      clientId: form.clientId || null,
      clientNom: clientNom || selectedClient?.nom || undefined,
      quantite: q,
      unite: form.unite.trim() || undefined,
      qualite: form.qualite.trim() || undefined,
      destination: form.destination.trim(),
      camionNom: form.camionNom.trim() || undefined,
      camionImmatriculation: form.camionImmatriculation.trim() || undefined,
      referenceAtc: form.referenceAtc.trim() || undefined,
      supplierLoadingId: form.supplierLoadingId || null,
      notes: form.notes.trim() || undefined,
      utilisateur: user?.login || 'system',
    };

    await withGuard(async () => {
      try {
        if (editing) {
          await updateTjkOperation(editing.id, payload);
          toast.success('Opération mise à jour.');
        } else {
          await createTjkOperation(payload);
          toast.success('Opération enregistrée.');
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
    if (!confirm('Supprimer cette opération TJK ?')) return;
    try {
      await deleteTjkOperation(id);
      await loadAll();
      toast.success('Opération supprimée.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression.');
    }
  };

  const exportColumns = [
    {
      header: 'Date',
      value: (op: TjkOperation) => new Date(op.date).toLocaleDateString('fr-FR'),
    },
    { header: 'Client', value: (op: TjkOperation) => formatTjkClientLabel(op) },
    {
      header: 'Quantité',
      value: (op: TjkOperation) =>
        `${op.quantite.toLocaleString('fr-FR')}${op.unite ? ` ${op.unite}` : ''}`,
    },
    { header: 'Qualité', value: (op: TjkOperation) => op.qualite || '' },
    { header: 'Destination', value: (op: TjkOperation) => op.destination || '' },
    { header: 'Camion', value: (op: TjkOperation) => formatTjkCamionLabel(op) },
    { header: 'ATC / n° de bon', value: (op: TjkOperation) => op.referenceAtc || '' },
    { header: 'Notes', value: (op: TjkOperation) => op.notes || '' },
  ];

  const exportFiltersParts: string[] = [];
  if (searchTerm.trim()) exportFiltersParts.push(`Recherche: "${searchTerm.trim()}"`);
  if (filterDateFrom) exportFiltersParts.push(`Du ${filterDateFrom}`);
  if (filterDateTo) exportFiltersParts.push(`Au ${filterDateTo}`);
  const exportFilters =
    exportFiltersParts.length > 0 ? exportFiltersParts.join(' · ') : undefined;

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Opérations TJK"
        description="Bons TJK à ventiler vers les clients, et opérations hors flotte Ansar."
        icon={ClipboardList}
        gradient="from-sky-500/20 via-cyan-500/10 to-transparent"
        iconColor="from-sky-600 via-cyan-600 to-teal-700"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              onExcel={() =>
                exportToExcel({
                  title: 'Opérations TJK',
                  fileName: `tjk_operations_${todayIso()}.xlsx`,
                  filtersDescription: exportFilters,
                  columns: exportColumns,
                  rows: sorted,
                })
              }
              onPdf={() =>
                exportToPrintablePDF({
                  title: 'Opérations TJK',
                  fileName: `tjk_operations_${todayIso()}.pdf`,
                  filtersDescription: exportFilters,
                  headerColor: '#0284c7',
                  headerTextColor: '#ffffff',
                  evenRowColor: '#f0f9ff',
                  oddRowColor: '#ffffff',
                  accentColor: '#0284c7',
                  totals: [
                    {
                      label: 'Opérations listées',
                      value: sorted.length,
                      style: 'neutral',
                    },
                  ],
                  columns: exportColumns,
                  rows: sorted,
                })
              }
            />
            {canManageFleet && (
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
                    Nouvelle opération
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editing ? 'Modifier l’opération' : 'Nouvelle opération TJK'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="tjk-date">Date *</Label>
                      <Input
                        id="tjk-date"
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Bon TJK (chargement)</Label>
                      <Select
                        value={form.supplierLoadingId || '__none__'}
                        onValueChange={(v) => {
                          const id = v === '__none__' ? '' : v;
                          setForm((f) => applyBonToForm(id, f));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Lier à un bon TJK…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sans bon (saisie libre)</SelectItem>
                          {tjkLoadings.map((l) => {
                            const used = ventilatedQtyForLoading(
                              l.id,
                              operations,
                              editing?.id,
                            );
                            const reste =
                              l.quantite != null && l.quantite > 0
                                ? Math.max(0, l.quantite - used)
                                : null;
                            const label = [
                              l.numeroBon?.trim() || 'Sans n°',
                              l.designation,
                              reste != null
                                ? `reste ${reste.toLocaleString('fr-FR')}${l.unite ? ` ${l.unite}` : ''}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ');
                            return (
                              <SelectItem key={l.id} value={l.id}>
                                {label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Les bons créés en mode TJK dans{' '}
                        <Link to="/chargements" className="underline underline-offset-2">
                          Chargements
                        </Link>{' '}
                        apparaissent ici pour être liés aux clients.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Client *</Label>
                      <ThirdPartyPicker
                        options={clients}
                        value={form.clientId}
                        onValueChange={(id) => {
                          const tp = clients.find((c) => c.id === id);
                          setForm((f) => ({
                            ...f,
                            clientId: id,
                            clientNom: tp?.nom ?? (id ? f.clientNom : ''),
                          }));
                        }}
                        placeholder="Choisir un client…"
                        searchPlaceholder="Nom, téléphone…"
                        topChoices={[{ id: '', label: 'Saisie libre (hors fiche)' }]}
                        orphanLabel={
                          form.clientNom.trim() && !form.clientId
                            ? form.clientNom.trim()
                            : undefined
                        }
                      />
                      <Input
                        placeholder="Nom client (si hors fiche)"
                        value={form.clientNom}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            clientNom: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="tjk-qty">Quantité *</Label>
                        <NumberInput
                          id="tjk-qty"
                          value={form.quantite}
                          onChange={(quantite) => setForm((f) => ({ ...f, quantite }))}
                          min={0}
                          allowEmpty
                          placeholder="Ex. 200"
                        />
                      </div>
                      <div>
                        <Label htmlFor="tjk-unite">Unité</Label>
                        <Input
                          id="tjk-unite"
                          value={form.unite}
                          onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))}
                          placeholder="sacs, t…"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tjk-qualite">Qualité</Label>
                      <Input
                        id="tjk-qualite"
                        value={form.qualite}
                        onChange={(e) => setForm((f) => ({ ...f, qualite: e.target.value }))}
                        placeholder="Ex. Ciment CPJ 45"
                      />
                      {sortedQualities.length > 0 && (
                        <Select
                          onValueChange={(v) => setForm((f) => ({ ...f, qualite: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir dans le catalogue…" />
                          </SelectTrigger>
                          <SelectContent>
                            {sortedQualities.map((q) => (
                              <SelectItem key={q.id} value={q.libelle}>
                                {q.libelle}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="tjk-dest">Destination *</Label>
                      <Input
                        id="tjk-dest"
                        value={form.destination}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, destination: e.target.value }))
                        }
                        required
                        placeholder="Ville / site"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="tjk-camion-nom">Camion (nom)</Label>
                        <Input
                          id="tjk-camion-nom"
                          value={form.camionNom}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, camionNom: e.target.value }))
                          }
                          placeholder="M2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="tjk-immat">Immatriculation</Label>
                        <Input
                          id="tjk-immat"
                          value={form.camionImmatriculation}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              camionImmatriculation: e.target.value,
                            }))
                          }
                          placeholder="Saisie manuelle"
                          className="uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="tjk-atc">ATC ou n° de bon</Label>
                      <Input
                        id="tjk-atc"
                        value={form.referenceAtc}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, referenceAtc: e.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor="tjk-notes">Notes</Label>
                      <Input
                        id="tjk-notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        Annuler
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Enregistrer
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      {pendingTjkBons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bons TJK à ventiler</CardTitle>
            <p className="text-sm text-muted-foreground">
              Liez chaque part du bon à un client depuis TJK.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingTjkBons.map(({ loading: bon, total, used, reste }) => (
              <div
                key={bon.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-md border p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium truncate">
                    {bon.numeroBon?.trim() || 'Bon sans numéro'} · {bon.designation}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bon.fournisseurNom || 'Fournisseur'} ·{' '}
                    {new Date(bon.dateChargement).toLocaleDateString('fr-FR')}
                    {total > 0 && (
                      <>
                        {' '}
                        · {used.toLocaleString('fr-FR')} / {total.toLocaleString('fr-FR')}
                        {bon.unite ? ` ${bon.unite}` : ''}
                        {reste > 0 ? ` · reste ${reste.toLocaleString('fr-FR')}` : ''}
                      </>
                    )}
                  </p>
                </div>
                {canManageFleet && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => openVentiler(bon.id)}
                  >
                    Ventiler vers un client
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-wrap sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher client, camion, destination…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-[160px] space-y-1">
              <Label className="text-xs text-muted-foreground">Du</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div className="w-[160px] space-y-1">
              <Label className="text-xs text-muted-foreground">Au</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
            <ListSortSelect
              id="sort-tjk"
              compact
              value={listSort}
              onChange={setListSort}
              options={[...SORT_OPTIONS]}
              className="w-[220px]"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Quantité</TableHead>
                  <TableHead>Qualité</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Camion</TableHead>
                  <TableHead>ATC / n° de bon</TableHead>
                  {canManageFleet && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManageFleet ? 8 : 7}
                      className="text-center text-muted-foreground py-8"
                    >
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManageFleet ? 8 : 7}
                      className="text-center text-muted-foreground py-8"
                    >
                      {operations.length === 0
                        ? 'Aucune opération TJK enregistrée.'
                        : 'Aucune opération ne correspond aux filtres.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(op.date).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>{formatTjkClientLabel(op)}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {op.quantite.toLocaleString('fr-FR')}
                        {op.unite ? ` ${op.unite}` : ''}
                      </TableCell>
                      <TableCell>{op.qualite || '—'}</TableCell>
                      <TableCell>{op.destination || '—'}</TableCell>
                      <TableCell>{formatTjkCamionLabel(op)}</TableCell>
                      <TableCell>{op.referenceAtc || '—'}</TableCell>
                      {canManageFleet && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(op)}
                              title="Modifier"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => void handleDelete(op.id)}
                              title="Supprimer"
                            >
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
