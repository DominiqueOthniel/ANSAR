/** Registre opérations Camrail : wagons, chargement, livraison, transporteur. */
import { useEffect, useMemo, useState } from 'react';
import { useApp, type Truck } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import { ExportButtons } from '@/components/ExportButtons';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  type CamrailOperation,
  createCamrailOperation,
  deleteCamrailOperation,
  formatCamrailCamionLabel,
  refreshCamrailOperationsFromApi,
  updateCamrailOperation,
} from '@/lib/camrail-operations';

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (récent → ancien)' },
  { value: 'date_asc', label: 'Date (ancien → récent)' },
  { value: 'destinataire_asc', label: 'Destinataire A → Z' },
  { value: 'quantite_desc', label: 'Quantité (plus haute → plus basse)' },
] as const;

/** Valeur Select pour basculer en saisie libre. */
const AUTRE = '__autre__';

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function formatOptionalDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('fr-FR');
}

function truckOptionLabel(t: Truck) {
  const nom = t.nom?.trim();
  if (nom) return nom;
  return t.immatriculation;
}

function uniqueSortedStrings(values: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const raw of values) {
    const v = raw?.trim();
    if (v) set.add(v);
  }
  return stableSort([...set], (a, b) => frCollator.compare(a, b));
}

/** Select catalogue + option Autre ; Input libre si Autre ou valeur hors liste. */
function CatalogOrAutreField({
  id,
  label,
  helper,
  options,
  value,
  onChange,
  placeholder,
  inputClassName,
  /** Remonte l’état « Autre » à chaque ouverture / reset du formulaire. */
  resetKey,
}: {
  id: string;
  label: string;
  helper?: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputClassName?: string;
  resetKey: string | number;
}) {
  const inList = Boolean(value) && options.includes(value);
  const [autreMode, setAutreMode] = useState(() => Boolean(value.trim()) && !inList);

  useEffect(() => {
    setAutreMode(Boolean(value.trim()) && !options.includes(value));
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (inList) setAutreMode(false);
    else if (value.trim()) setAutreMode(true);
  }, [value, inList]);

  const selectValue = inList ? value : autreMode ? AUTRE : undefined;
  const showInput = autreMode;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === AUTRE) {
            setAutreMode(true);
            if (inList) onChange('');
          } else {
            setAutreMode(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Choisir…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
          <SelectItem value={AUTRE}>Autre (saisie)</SelectItem>
        </SelectContent>
      </Select>
      {showInput ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Saisie libre'}
          className={inputClassName}
        />
      ) : null}
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

type FormState = {
  date: string;
  camionNom: string;
  camionImmatriculation: string;
  quantite: number | undefined;
  typeProduit: string;
  referenceAtc: string;
  atComplement: number | undefined;
  destinataire: string;
  dateChargement: string;
  dateLivraison: string;
  numeroWagon: string;
  commentaires: string;
  transporteur: string;
};

const emptyForm = (): FormState => ({
  date: todayIso(),
  camionNom: '',
  camionImmatriculation: '',
  quantite: undefined,
  typeProduit: '',
  referenceAtc: '',
  atComplement: undefined,
  destinataire: '',
  dateChargement: '',
  dateLivraison: '',
  numeroWagon: '',
  commentaires: '',
  transporteur: '',
});

export default function Camrail() {
  const {
    trucks,
    thirdParties,
    merchandiseQualities,
    trips,
    supplierLoadings,
  } = useApp();
  const { user, canManageFleet } = useAuth();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [operations, setOperations] = useState<CamrailOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CamrailOperation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [listSort, setListSort] = useState<string>('date_desc');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formKey, setFormKey] = useState(0);
  const [camionAutreMode, setCamionAutreMode] = useState(false);
  const [typeAutreMode, setTypeAutreMode] = useState(false);
  const [destinataireLibre, setDestinataireLibre] = useState(false);

  const qualityLabels = useMemo(
    () => uniqueSortedStrings(merchandiseQualities.map((q) => q.libelle)),
    [merchandiseQualities],
  );

  const sortedTrucks = useMemo(
    () =>
      stableSort([...trucks], (a, b) =>
        frCollator.compare(truckOptionLabel(a), truckOptionLabel(b)),
      ),
    [trucks],
  );

  const clients = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'client' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const transporteurOptions = useMemo(() => {
    const fromFournisseurs = thirdParties
      .filter((tp) => tp.type === 'fournisseur')
      .map((tp) => tp.nom);
    const fromOps = operations.map((op) => op.transporteur);
    return uniqueSortedStrings([...fromFournisseurs, ...fromOps]);
  }, [thirdParties, operations]);

  const atcOptions = useMemo(() => {
    const fromTrips = trips.map((t) => t.referenceAtc);
    const fromBons = supplierLoadings.map((s) => s.numeroBon);
    const fromOps = operations.map((op) => op.referenceAtc);
    return uniqueSortedStrings([...fromTrips, ...fromBons, ...fromOps]);
  }, [trips, supplierLoadings, operations]);

  const wagonOptions = useMemo(
    () => uniqueSortedStrings(operations.map((op) => op.numeroWagon)),
    [operations],
  );

  const matchedTruck = useMemo(() => {
    const immat = form.camionImmatriculation.trim();
    const nom = form.camionNom.trim();
    if (immat) {
      const byImmat = sortedTrucks.find((t) => t.immatriculation === immat);
      if (byImmat) return byImmat;
    }
    if (nom) {
      return (
        sortedTrucks.find((t) => t.nom?.trim() === nom) ||
        sortedTrucks.find((t) => truckOptionLabel(t) === nom) ||
        null
      );
    }
    return null;
  }, [sortedTrucks, form.camionImmatriculation, form.camionNom]);

  const destinataireClient = useMemo(
    () => clients.find((c) => c.nom === form.destinataire) ?? null,
    [clients, form.destinataire],
  );

  const typeInCatalog = Boolean(form.typeProduit) && qualityLabels.includes(form.typeProduit);

  useEffect(() => {
    setTypeAutreMode(Boolean(form.typeProduit.trim()) && !qualityLabels.includes(form.typeProduit));
    setCamionAutreMode(
      Boolean(form.camionNom.trim() || form.camionImmatriculation.trim()) && !matchedTruck,
    );
    setDestinataireLibre(Boolean(form.destinataire.trim()) && !destinataireClient);
  }, [formKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeInCatalog) setTypeAutreMode(false);
    else if (form.typeProduit.trim()) setTypeAutreMode(true);
  }, [form.typeProduit, typeInCatalog]);

  useEffect(() => {
    if (matchedTruck) setCamionAutreMode(false);
    else if (form.camionNom.trim() || form.camionImmatriculation.trim()) setCamionAutreMode(true);
  }, [matchedTruck, form.camionNom, form.camionImmatriculation]);

  useEffect(() => {
    if (destinataireClient) setDestinataireLibre(false);
    else if (form.destinataire.trim()) setDestinataireLibre(true);
  }, [destinataireClient, form.destinataire]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const rows = await refreshCamrailOperationsFromApi();
      setOperations(rows);
    } catch (e) {
      console.error(e);
      toast.error('Impossible de charger les opérations Camrail.');
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
        formatCamrailCamionLabel(op).toLowerCase().includes(q) ||
        (op.destinataire ?? '').toLowerCase().includes(q) ||
        (op.typeProduit ?? '').toLowerCase().includes(q) ||
        (op.referenceAtc ?? '').toLowerCase().includes(q) ||
        (op.numeroWagon ?? '').toLowerCase().includes(q) ||
        (op.transporteur ?? '').toLowerCase().includes(q) ||
        (op.commentaires ?? '').toLowerCase().includes(q) ||
        String(op.quantite).includes(q) ||
        (op.atComplement != null ? String(op.atComplement) : '').includes(q)
      );
    });
  }, [operations, searchTerm, filterDateFrom, filterDateTo]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.date) - parseDateMs(b.date));
      case 'destinataire_asc':
        return stableSort(list, (a, b) =>
          frCollator.compare(a.destinataire || '', b.destinataire || ''),
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
    setCamionAutreMode(false);
    setTypeAutreMode(false);
    setDestinataireLibre(false);
    setFormKey((k) => k + 1);
  };

  const openCreate = () => {
    setForm(emptyForm());
    setEditing(null);
    setCamionAutreMode(false);
    setTypeAutreMode(false);
    setDestinataireLibre(false);
    setFormKey((k) => k + 1);
    setDialogOpen(true);
  };

  const openEdit = (op: CamrailOperation) => {
    setEditing(op);
    setForm({
      date: op.date.split('T')[0] || op.date,
      camionNom: op.camionNom || '',
      camionImmatriculation: op.camionImmatriculation || '',
      quantite: op.quantite,
      typeProduit: op.typeProduit || '',
      referenceAtc: op.referenceAtc || '',
      atComplement: op.atComplement ?? undefined,
      destinataire: op.destinataire || '',
      dateChargement: op.dateChargement?.split('T')[0] || '',
      dateLivraison: op.dateLivraison?.split('T')[0] || '',
      numeroWagon: op.numeroWagon || '',
      commentaires: op.commentaires || '',
      transporteur: op.transporteur || '',
    });
    setFormKey((k) => k + 1);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(form.quantite);
    if (!form.date) {
      toast.error('Indiquez la date de l’opération.');
      return;
    }
    if (!Number.isFinite(q) || q < 0) {
      toast.error('Indiquez une quantité valide.');
      return;
    }
    if (
      form.atComplement !== undefined &&
      form.atComplement !== null &&
      (!Number.isFinite(Number(form.atComplement)) || Number(form.atComplement) < 0)
    ) {
      toast.error('Complément AT invalide.');
      return;
    }

    const payload = {
      date: form.date,
      camionNom: form.camionNom.trim() || undefined,
      camionImmatriculation: form.camionImmatriculation.trim() || undefined,
      quantite: q,
      typeProduit: form.typeProduit.trim() || undefined,
      referenceAtc: form.referenceAtc.trim() || undefined,
      atComplement:
        form.atComplement === undefined || form.atComplement === null
          ? null
          : Number(form.atComplement),
      destinataire: form.destinataire.trim() || undefined,
      dateChargement: form.dateChargement.trim() || null,
      dateLivraison: form.dateLivraison.trim() || null,
      numeroWagon: form.numeroWagon.trim() || undefined,
      commentaires: form.commentaires.trim() || undefined,
      transporteur: form.transporteur.trim() || undefined,
      utilisateur: user?.login || 'system',
    };

    await withGuard(async () => {
      try {
        if (editing) {
          await updateCamrailOperation(editing.id, payload);
          toast.success('Opération mise à jour.');
        } else {
          await createCamrailOperation(payload);
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
    if (!confirm('Supprimer cette opération Camrail ?')) return;
    try {
      await deleteCamrailOperation(id);
      await loadAll();
      toast.success('Opération supprimée.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression.');
    }
  };

  const exportColumns = [
    {
      header: 'Date',
      value: (op: CamrailOperation) => new Date(op.date).toLocaleDateString('fr-FR'),
    },
    {
      header: 'Camion',
      value: (op: CamrailOperation) => formatCamrailCamionLabel(op),
    },
    {
      header: 'Quantité',
      value: (op: CamrailOperation) => op.quantite.toLocaleString('fr-FR'),
    },
    { header: 'Type', value: (op: CamrailOperation) => op.typeProduit || '' },
    { header: 'ATC', value: (op: CamrailOperation) => op.referenceAtc || '' },
    {
      header: 'Complément AT',
      value: (op: CamrailOperation) =>
        op.atComplement != null ? String(op.atComplement) : '',
    },
    {
      header: 'Destinataire',
      value: (op: CamrailOperation) => op.destinataire || '',
    },
    {
      header: 'Date de chargement',
      value: (op: CamrailOperation) =>
        op.dateChargement
          ? new Date(op.dateChargement).toLocaleDateString('fr-FR')
          : '',
    },
    {
      header: 'Date de livraison',
      value: (op: CamrailOperation) =>
        op.dateLivraison
          ? new Date(op.dateLivraison).toLocaleDateString('fr-FR')
          : '',
    },
    {
      header: 'Numéro wagon',
      value: (op: CamrailOperation) => op.numeroWagon || '',
    },
    {
      header: 'Transporteur',
      value: (op: CamrailOperation) => op.transporteur || '',
    },
    {
      header: 'Commentaires',
      value: (op: CamrailOperation) => op.commentaires || '',
    },
  ];

  const exportFiltersParts: string[] = [];
  if (searchTerm.trim()) exportFiltersParts.push(`Recherche: "${searchTerm.trim()}"`);
  if (filterDateFrom) exportFiltersParts.push(`Du ${filterDateFrom}`);
  if (filterDateTo) exportFiltersParts.push(`Au ${filterDateTo}`);
  const exportFilters =
    exportFiltersParts.length > 0 ? exportFiltersParts.join(' · ') : undefined;

  const colCount = canManageFleet ? 11 : 10;

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Opérations Camrail"
        description="Suivi wagons CAMRAIL (chargement, livraison, transporteur)."
        icon={ClipboardList}
        gradient="from-sky-500/20 via-blue-500/10 to-transparent"
        iconColor="from-sky-600 via-blue-600 to-indigo-700"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              onExcel={() =>
                exportToExcel({
                  title: 'Opérations Camrail',
                  fileName: `camrail_operations_${todayIso()}.xlsx`,
                  filtersDescription: exportFilters,
                  columns: exportColumns,
                  rows: sorted,
                })
              }
              onPdf={() =>
                exportToPrintablePDF({
                  title: 'Opérations Camrail',
                  fileName: `camrail_operations_${todayIso()}.pdf`,
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
                      {editing ? 'Modifier l’opération' : 'Nouvelle opération Camrail'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="camrail-date">Date *</Label>
                      <Input
                        id="camrail-date"
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="camrail-camion">Camion</Label>
                      <Select
                        value={
                          matchedTruck
                            ? matchedTruck.id
                            : camionAutreMode
                              ? AUTRE
                              : undefined
                        }
                        onValueChange={(v) => {
                          if (v === AUTRE) {
                            setCamionAutreMode(true);
                            if (matchedTruck) {
                              setForm((f) => ({
                                ...f,
                                camionNom: '',
                                camionImmatriculation: '',
                              }));
                            }
                            return;
                          }
                          const t = sortedTrucks.find((x) => x.id === v);
                          if (!t) return;
                          setCamionAutreMode(false);
                          setForm((f) => ({
                            ...f,
                            camionNom: t.nom?.trim() || truckOptionLabel(t),
                            camionImmatriculation: t.immatriculation,
                          }));
                        }}
                      >
                        <SelectTrigger id="camrail-camion">
                          <SelectValue placeholder="Choisir un camion…" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedTrucks.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {truckOptionLabel(t)}
                              {t.nom?.trim() && t.immatriculation
                                ? ` (${t.immatriculation})`
                                : ''}
                            </SelectItem>
                          ))}
                          <SelectItem value={AUTRE}>Autre (saisie)</SelectItem>
                        </SelectContent>
                      </Select>
                      {camionAutreMode ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="camrail-camion-nom">Nom</Label>
                            <Input
                              id="camrail-camion-nom"
                              value={form.camionNom}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, camionNom: e.target.value }))
                              }
                              placeholder="Ex. M5, TF1"
                              className="uppercase"
                            />
                          </div>
                          <div>
                            <Label htmlFor="camrail-immat">Immatriculation</Label>
                            <Input
                              id="camrail-immat"
                              value={form.camionImmatriculation}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  camionImmatriculation: e.target.value,
                                }))
                              }
                              placeholder="Optionnel"
                              className="uppercase"
                            />
                          </div>
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Liste des camions (écrans Camions / TJK).
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="camrail-qty">Quantité *</Label>
                      <NumberInput
                        id="camrail-qty"
                        value={form.quantite}
                        onChange={(quantite) => setForm((f) => ({ ...f, quantite }))}
                        min={0}
                        allowEmpty
                        placeholder="Ex. 200"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="camrail-type">Type</Label>
                      <Select
                        value={
                          typeInCatalog
                            ? form.typeProduit
                            : typeAutreMode
                              ? AUTRE
                              : undefined
                        }
                        onValueChange={(v) => {
                          if (v === AUTRE) {
                            setTypeAutreMode(true);
                            if (typeInCatalog) {
                              setForm((f) => ({ ...f, typeProduit: '' }));
                            }
                            return;
                          }
                          setTypeAutreMode(false);
                          setForm((f) => ({ ...f, typeProduit: v }));
                        }}
                      >
                        <SelectTrigger id="camrail-type">
                          <SelectValue placeholder="Choisir dans le catalogue…" />
                        </SelectTrigger>
                        <SelectContent>
                          {qualityLabels.map((libelle) => (
                            <SelectItem key={libelle} value={libelle}>
                              {libelle}
                            </SelectItem>
                          ))}
                          <SelectItem value={AUTRE}>Autre (saisie)</SelectItem>
                        </SelectContent>
                      </Select>
                      {typeAutreMode ? (
                        <Input
                          value={form.typeProduit}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, typeProduit: e.target.value }))
                          }
                          placeholder="Ex. Cimaf 32.5R, Miraco…"
                        />
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Catalogue qualités / marchandises.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <CatalogOrAutreField
                        id="camrail-atc"
                        label="ATC"
                        helper="Références ATC / bons (Trajets, Chargements)."
                        options={atcOptions}
                        value={form.referenceAtc}
                        onChange={(referenceAtc) =>
                          setForm((f) => ({ ...f, referenceAtc }))
                        }
                        resetKey={formKey}
                      />
                      <div>
                        <Label htmlFor="camrail-at-comp">Complément AT</Label>
                        <NumberInput
                          id="camrail-at-comp"
                          value={form.atComplement}
                          onChange={(atComplement) =>
                            setForm((f) => ({ ...f, atComplement }))
                          }
                          min={0}
                          allowEmpty
                          placeholder="Ex. 100, 200…"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Destinataire</Label>
                      <ThirdPartyPicker
                        options={clients}
                        value={
                          destinataireClient?.id ?? (destinataireLibre ? AUTRE : '')
                        }
                        onValueChange={(id) => {
                          if (!id || id === AUTRE) {
                            setDestinataireLibre(true);
                            setForm((f) => ({
                              ...f,
                              destinataire: destinataireClient ? '' : f.destinataire,
                            }));
                            return;
                          }
                          const tp = clients.find((c) => c.id === id);
                          setDestinataireLibre(false);
                          setForm((f) => ({ ...f, destinataire: tp?.nom ?? '' }));
                        }}
                        placeholder="Choisir un client…"
                        searchPlaceholder="Nom, téléphone…"
                        topChoices={[{ id: AUTRE, label: 'Autre (saisie libre)' }]}
                        orphanLabel={
                          form.destinataire.trim() && !destinataireClient
                            ? form.destinataire.trim()
                            : undefined
                        }
                      />
                      {destinataireLibre ? (
                        <Input
                          id="camrail-dest"
                          value={form.destinataire}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, destinataire: e.target.value }))
                          }
                          placeholder="Nom du destinataire"
                        />
                      ) : null}
                      <p className="text-xs text-muted-foreground">Fiches Clients.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="camrail-chargement">Date de chargement</Label>
                        <Input
                          id="camrail-chargement"
                          type="date"
                          value={form.dateChargement}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dateChargement: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="camrail-livraison">Date de livraison</Label>
                        <Input
                          id="camrail-livraison"
                          type="date"
                          value={form.dateLivraison}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              dateLivraison: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <CatalogOrAutreField
                        id="camrail-wagon"
                        label="Numéro wagon"
                        options={wagonOptions}
                        value={form.numeroWagon}
                        onChange={(numeroWagon) =>
                          setForm((f) => ({ ...f, numeroWagon }))
                        }
                        resetKey={formKey}
                      />
                      <CatalogOrAutreField
                        id="camrail-transporteur"
                        label="Transporteur"
                        options={transporteurOptions}
                        value={form.transporteur}
                        onChange={(transporteur) =>
                          setForm((f) => ({ ...f, transporteur }))
                        }
                        resetKey={formKey}
                      />
                    </div>

                    <div>
                      <Label htmlFor="camrail-commentaires">Commentaires</Label>
                      <Input
                        id="camrail-commentaires"
                        value={form.commentaires}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, commentaires: e.target.value }))
                        }
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

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-wrap sm:flex-row gap-3 items-stretch sm:items-end">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher camion, destinataire, wagon…"
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
              id="sort-camrail"
              compact
              value={listSort}
              onChange={setListSort}
              options={[...SORT_OPTIONS]}
              className="w-[220px]"
            />
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Camion</TableHead>
                  <TableHead>Qté</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>ATC</TableHead>
                  <TableHead>Destinataire</TableHead>
                  <TableHead>Chargement</TableHead>
                  <TableHead>Livraison</TableHead>
                  <TableHead>Wagon</TableHead>
                  <TableHead>Transporteur</TableHead>
                  {canManageFleet && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={colCount}
                      className="text-center text-muted-foreground py-8"
                    >
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={colCount}
                      className="text-center text-muted-foreground py-8"
                    >
                      {operations.length === 0
                        ? 'Aucune opération Camrail enregistrée.'
                        : 'Aucune opération ne correspond aux filtres.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(op.date).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>{formatCamrailCamionLabel(op)}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {op.quantite.toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell>{op.typeProduit || '—'}</TableCell>
                      <TableCell>{op.referenceAtc || '—'}</TableCell>
                      <TableCell>{op.destinataire || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatOptionalDate(op.dateChargement)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatOptionalDate(op.dateLivraison)}
                      </TableCell>
                      <TableCell>{op.numeroWagon || '—'}</TableCell>
                      <TableCell>{op.transporteur || '—'}</TableCell>
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
