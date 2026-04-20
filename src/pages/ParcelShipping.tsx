import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Edit,
  Trash2,
  Package,
  Search,
  FileDown,
  FileText,
  Truck,
  MapPin,
  Building2,
  MinusCircle,
  Filter,
  X,
  Loader2,
  Eye,
  Receipt,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import {
  useApp,
  type Trip,
  type TripStatus,
  type ParcelExpedition,
  type ParcelExpeditionLot,
} from '@/contexts/AppContext';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';
import CityPicker, { CAMEROON_CITIES } from '@/components/CityPicker';
import { formatTripStatusFr } from '@/lib/sync-utils';

const ORIGIN_NAME = 'Douala';

function getDoualaCoords(): { lat: number; lng: number } {
  const d = CAMEROON_CITIES.find((c) => c.name === ORIGIN_NAME);
  return d ? { lat: d.lat, lng: d.lng } : { lat: 4.0511, lng: 9.7679 };
}

const EXPEDITION_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Départ (récent → ancien)' },
  { value: 'date_asc', label: 'Départ (ancien → récent)' },
  { value: 'dest_asc', label: 'Destination A → Z' },
  { value: 'statut_asc', label: 'Statut A → Z' },
  { value: 'lots_desc', label: 'Nombre d’opérations (↓)' },
  { value: 'montant_desc', label: 'Montant total (↓)' },
] as const;

const UNITE_SUGGESTIONS = [
  'carton',
  'sac',
  'palette',
  'colis',
  'pièce',
  'caisse',
  'm³',
  'kg',
] as const;

function roundMontantFcfa(q: number, pu: number): number {
  const n = q * pu;
  return Math.round(Number.isFinite(n) ? n : 0);
}

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

function dateLocaleOrDash(iso?: string): string {
  if (!iso?.trim()) return '—';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? '—' : new Date(iso).toLocaleDateString('fr-FR');
}

function sumExpeditionMontant(lots: ParcelExpeditionLot[]): number {
  return lots.reduce((s, l) => s + (Number.isFinite(l.montant) ? l.montant : 0), 0);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultReference(): string {
  const t = Date.now().toString(36).toUpperCase();
  return `EXP-${t}`;
}

function isActiveStatus(s: TripStatus): boolean {
  return s === 'planifie' || s === 'en_cours';
}

function collectMissionAssignments(
  trips: Trip[],
  expeditions: ParcelExpedition[],
  excludeExpeditionId?: string,
): { truckIds: Set<string>; driverIds: Set<string> } {
  const truckIds = new Set<string>();
  const driverIds = new Set<string>();
  for (const t of trips) {
    if (!isActiveStatus(t.statut)) continue;
    if (t.tracteurId) truckIds.add(t.tracteurId);
    if (t.remorqueuseId) truckIds.add(t.remorqueuseId);
    if (t.chauffeurId) driverIds.add(t.chauffeurId);
  }
  for (const e of expeditions) {
    if (excludeExpeditionId && e.id === excludeExpeditionId) continue;
    if (!isActiveStatus(e.statut)) continue;
    if (e.tracteurId) truckIds.add(e.tracteurId);
    if (e.remorqueuseId) truckIds.add(e.remorqueuseId);
    if (e.chauffeurId) driverIds.add(e.chauffeurId);
  }
  return { truckIds, driverIds };
}

function statutBadgeVariant(s: TripStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'termine') return 'default';
  if (s === 'annule') return 'destructive';
  if (s === 'en_cours') return 'secondary';
  return 'outline';
}

const emptyLot = (): ParcelExpeditionLot => ({
  id: newId(),
  clients: '',
  unite: 'carton',
  quantite: 1,
  prixUnitaire: 0,
  montant: 0,
  observations: '',
});

export default function ParcelShipping() {
  const {
    trips,
    trucks,
    drivers,
    parcelExpeditions,
    invoices,
    createExpense,
    isLoading,
    refreshParcelExpeditions,
    createParcelExpedition,
    updateParcelExpedition,
    deleteParcelExpedition,
  } = useApp();
  const { canManageFleet, canManageAccounting } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [destPickerOpen, setDestPickerOpen] = useState(false);
  const [editing, setEditing] = useState<ParcelExpedition | null>(null);
  const [viewing, setViewing] = useState<ParcelExpedition | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [filterDestination, setFilterDestination] = useState<string>('all');
  const [filterChauffeurId, setFilterChauffeurId] = useState<string>('all');
  const [filterTracteurId, setFilterTracteurId] = useState<string>('all');
  const [filterRemorqueuseId, setFilterRemorqueuseId] = useState<string>('all');
  const [filterDateDepartFrom, setFilterDateDepartFrom] = useState('');
  const [filterDateDepartTo, setFilterDateDepartTo] = useState('');
  const [listSort, setListSort] = useState<string>('date_desc');

  const douala = getDoualaCoords();
  const [form, setForm] = useState({
    reference: '',
    destination: '',
    destinationLat: undefined as number | undefined,
    destinationLng: undefined as number | undefined,
    tracteurId: '',
    remorqueuseId: '',
    chauffeurId: '',
    dateDepart: '',
    dateArrivee: '',
    statut: 'planifie' as TripStatus,
    prefinancement: 0,
    description: '',
    commissionPct: 0,
    lots: [emptyLot(), emptyLot()] as ParcelExpeditionLot[],
  });

  const { truckIds: busyTrucks, driverIds: busyDrivers } = useMemo(
    () => collectMissionAssignments(trips, parcelExpeditions, editing?.id),
    [trips, parcelExpeditions, editing?.id],
  );

  const tracteurs = useMemo(
    () =>
      trucks.filter(
        (t) =>
          t.type === 'tracteur' &&
          t.statut === 'actif' &&
          (!busyTrucks.has(t.id) ||
            (editing?.tracteurId && t.id === editing.tracteurId)),
      ),
    [trucks, busyTrucks, editing?.tracteurId],
  );

  const remorqueuses = useMemo(
    () =>
      trucks.filter(
        (t) =>
          t.type === 'remorqueuse' &&
          t.statut === 'actif' &&
          (!busyTrucks.has(t.id) ||
            (editing?.remorqueuseId && t.id === editing.remorqueuseId)),
      ),
    [trucks, busyTrucks, editing?.remorqueuseId],
  );

  const availableDrivers = useMemo(
    () =>
      drivers.filter(
        (d) =>
          !busyDrivers.has(d.id) || (editing?.chauffeurId && d.id === editing.chauffeurId),
      ),
    [drivers, busyDrivers, editing?.chauffeurId],
  );

  const resetForm = () => {
    setEditing(null);
    setForm({
      reference: defaultReference(),
      destination: '',
      destinationLat: undefined,
      destinationLng: undefined,
      tracteurId: '',
      remorqueuseId: '',
      chauffeurId: '',
      dateDepart: new Date().toISOString().split('T')[0],
      dateArrivee: '',
      statut: 'planifie',
      prefinancement: 0,
      description: '',
      commissionPct: 0,
      lots: [emptyLot(), emptyLot()],
    });
  };

  const openCreate = () => {
    resetForm();
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (ex: ParcelExpedition) => {
    setEditing(ex);
    setForm({
      reference: ex.reference,
      destination: ex.destination,
      destinationLat: ex.destinationLat,
      destinationLng: ex.destinationLng,
      tracteurId: ex.tracteurId ?? '',
      remorqueuseId: ex.remorqueuseId ?? '',
      chauffeurId: ex.chauffeurId,
      dateDepart: ex.dateDepart,
      dateArrivee: ex.dateArrivee ?? '',
      statut: ex.statut,
      prefinancement: 0,
      description: ex.description ?? '',
      commissionPct: ex.commissionPct ?? 0,
      lots: ex.lots.length > 0 ? ex.lots.map((l) => ({ ...l })) : [emptyLot()],
    });
    setDialogOpen(true);
  };

  const updateLot = (lotId: string, patch: Partial<ParcelExpeditionLot>) => {
    setForm((f) => ({
      ...f,
      lots: f.lots.map((l) => {
        if (l.id !== lotId) return l;
        const next = { ...l, ...patch };
        if ('quantite' in patch || 'prixUnitaire' in patch) {
          const q = Number.isFinite(next.quantite) ? Math.max(0, next.quantite) : 0;
          const pu = Number.isFinite(next.prixUnitaire) ? Math.max(0, next.prixUnitaire) : 0;
          next.quantite = q;
          next.prixUnitaire = pu;
          next.montant = roundMontantFcfa(q, pu);
        }
        return next;
      }),
    }));
  };

  const addLotRow = () => {
    setForm((f) => ({ ...f, lots: [...f.lots, emptyLot()] }));
  };

  const removeLotRow = (lotId: string) => {
    setForm((f) => ({
      ...f,
      lots: f.lots.length <= 1 ? f.lots : f.lots.filter((l) => l.id !== lotId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tracteurId && !form.remorqueuseId) {
      toast.error('Sélectionnez au moins un tracteur ou une remorqueuse.');
      return;
    }
    if (!form.destination.trim()) {
      toast.error('Indiquez la destination de l’expédition.');
      return;
    }
    if (!form.chauffeurId) {
      toast.error('Sélectionnez un chauffeur.');
      return;
    }
    if (!form.dateDepart) {
      toast.error('Indiquez la date de départ.');
      return;
    }
    const lotsClean = form.lots
      .map((l) => {
        const quantite = Number.isFinite(l.quantite) ? l.quantite : 0;
        const prixUnitaire = Number.isFinite(l.prixUnitaire) ? Math.max(0, l.prixUnitaire) : 0;
        return {
          ...l,
          clients: l.clients.trim(),
          unite: l.unite.trim(),
          quantite,
          prixUnitaire,
          montant: roundMontantFcfa(quantite, prixUnitaire),
          observations: l.observations?.trim() || undefined,
        };
      })
      .filter((l) => l.clients && l.unite && l.quantite > 0);
    if (lotsClean.length === 0) {
      toast.error('Ajoutez au moins une ligne avec clients, unité et quantité valides.');
      return;
    }

    const ref = form.reference.trim() || defaultReference();
    const prefinancementValue = Number.isFinite(form.prefinancement)
      ? Math.max(0, form.prefinancement)
      : 0;

    const payload = {
      reference: ref,
      origine: ORIGIN_NAME,
      origineLat: douala.lat,
      origineLng: douala.lng,
      destination: form.destination.trim(),
      destinationLat: form.destinationLat,
      destinationLng: form.destinationLng,
      tracteurId: form.tracteurId || undefined,
      remorqueuseId: form.remorqueuseId || undefined,
      chauffeurId: form.chauffeurId,
      dateDepart: form.dateDepart,
      dateArrivee: form.dateArrivee.trim() || undefined,
      statut: form.statut,
      lots: lotsClean.map((l) => ({
        id: l.id,
        clients: l.clients,
        unite: l.unite,
        quantite: l.quantite,
        prixUnitaire: l.prixUnitaire,
        montant: l.montant,
        observations: l.observations,
      })),
      description: form.description.trim() || undefined,
      commissionPct: Number.isFinite(form.commissionPct)
        ? Math.min(100, Math.max(0, form.commissionPct))
        : undefined,
      dateCreation: editing?.dateCreation,
    };

    try {
      if (editing) {
        await updateParcelExpedition(editing.id, payload);
        toast.success('Expédition mise à jour');
      } else {
        const createdExpedition = await createParcelExpedition({
          ...payload,
          dateCreation: payload.dateCreation ?? new Date().toISOString().split('T')[0],
        });
        if (prefinancementValue > 0) {
          try {
            await createExpense({
              camionId: payload.tracteurId || payload.remorqueuseId || undefined,
              chauffeurId: payload.chauffeurId || undefined,
              categorie: 'Préfinancement',
              sousCategorie: 'Expédition',
              montant: prefinancementValue,
              date: payload.dateDepart,
              description: `Préfinancement expédition ${createdExpedition.reference} (${payload.origine} → ${payload.destination})`,
            });
          } catch (prefiErr) {
            console.error('createParcelExpedition prefinancement expense', prefiErr);
            toast.warning(
              "Expédition créée, mais la dépense de préfinancement n'a pas pu être enregistrée automatiquement.",
            );
          }
        }
        toast.success('Expédition enregistrée');
      }
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur enregistrement expédition');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette expédition ?')) return;
    try {
      await deleteParcelExpedition(id);
      toast.success('Expédition supprimée');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression');
    }
  };

  const driverLabel = (id: string) => {
    const d = drivers.find((x) => x.id === id);
    return d ? `${d.prenom} ${d.nom}` : '—';
  };

  const driverPhone = (id: string) => {
    const d = drivers.find((x) => x.id === id);
    const tel = d?.telephone?.trim();
    return tel || '—';
  };

  const truckBits = (tracteurId?: string, remorqueuseId?: string) => {
    const bits: string[] = [];
    if (tracteurId) {
      const t = trucks.find((x) => x.id === tracteurId);
      if (t) bits.push(t.immatriculation);
    }
    if (remorqueuseId) {
      const t = trucks.find((x) => x.id === remorqueuseId);
      if (t) bits.push(t.immatriculation);
    }
    return bits.length ? bits.join(' + ') : '—';
  };

  const allDestinations = useMemo(() => {
    const set = new Set<string>();
    for (const ex of parcelExpeditions) {
      if (ex.destination?.trim()) set.add(ex.destination.trim());
    }
    return [...set].sort((a, b) => frCollator.compare(a, b));
  }, [parcelExpeditions]);

  const hasActiveFilters = useMemo(
    () =>
      searchTerm.trim() !== '' ||
      filterStatut !== 'all' ||
      filterDestination !== 'all' ||
      filterChauffeurId !== 'all' ||
      filterTracteurId !== 'all' ||
      filterRemorqueuseId !== 'all' ||
      filterDateDepartFrom.trim() !== '' ||
      filterDateDepartTo.trim() !== '',
    [
      searchTerm,
      filterStatut,
      filterDestination,
      filterChauffeurId,
      filterTracteurId,
      filterRemorqueuseId,
      filterDateDepartFrom,
      filterDateDepartTo,
    ],
  );

  const resetFilters = () => {
    setSearchTerm('');
    setFilterStatut('all');
    setFilterDestination('all');
    setFilterChauffeurId('all');
    setFilterTracteurId('all');
    setFilterRemorqueuseId('all');
    setFilterDateDepartFrom('');
    setFilterDateDepartTo('');
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return parcelExpeditions.filter((ex) => {
      if (filterStatut !== 'all' && ex.statut !== filterStatut) return false;
      if (filterDestination !== 'all' && ex.destination !== filterDestination) return false;
      if (filterChauffeurId !== 'all' && ex.chauffeurId !== filterChauffeurId) return false;
      if (filterTracteurId !== 'all' && ex.tracteurId !== filterTracteurId) return false;
      if (filterRemorqueuseId !== 'all' && ex.remorqueuseId !== filterRemorqueuseId) return false;
      if (filterDateDepartFrom.trim()) {
        if (parseDateMs(ex.dateDepart) < parseDateMs(filterDateDepartFrom.trim())) return false;
      }
      if (filterDateDepartTo.trim()) {
        if (parseDateMs(ex.dateDepart) > parseDateMs(filterDateDepartTo.trim())) return false;
      }
      if (!q) return true;
      const hay = [
        ex.reference,
        ex.destination,
        ex.description ?? '',
        ...ex.lots.map(
          (l) =>
            `${l.clients} ${l.unite} ${l.quantite} ${l.prixUnitaire} ${l.observations ?? ''}`,
        ),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    parcelExpeditions,
    searchTerm,
    filterStatut,
    filterDestination,
    filterChauffeurId,
    filterTracteurId,
    filterRemorqueuseId,
    filterDateDepartFrom,
    filterDateDepartTo,
  ]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.dateDepart) - parseDateMs(b.dateDepart));
      case 'dest_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.destination, b.destination));
      case 'statut_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.statut, b.statut));
      case 'lots_desc':
        return stableSort(list, (a, b) => b.lots.length - a.lots.length);
      case 'montant_desc':
        return stableSort(
          list,
          (a, b) => sumExpeditionMontant(b.lots) - sumExpeditionMontant(a.lots),
        );
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.dateDepart) - parseDateMs(a.dateDepart));
    }
  }, [filtered, listSort]);

  const counts = useMemo(() => {
    const c = { planifie: 0, en_cours: 0, termine: 0, annule: 0 };
    for (const ex of parcelExpeditions) {
      c[ex.statut]++;
    }
    return c;
  }, [parcelExpeditions]);

  const getInvoiceForExpedition = (expeditionId: string) =>
    invoices.find((inv) => inv.parcelExpeditionId === expeditionId);

  const recipientsSummary = (ex: ParcelExpedition) => {
    const uniq = [...new Set(ex.lots.map((l) => l.clients?.trim()).filter(Boolean) as string[])];
    return uniq.length ? uniq.join(', ') : '—';
  };

  const commissionAmount = (ex: ParcelExpedition) =>
    Math.round((sumExpeditionMontant(ex.lots) * (ex.commissionPct ?? 0)) / 100);

  const exportSortLine = useMemo(() => {
    const parts: string[] = [];
    const label = EXPEDITION_SORT_OPTIONS.find((o) => o.value === listSort)?.label;
    if (label) parts.push(`Tri : ${label}`);
    if (hasActiveFilters) parts.push('Filtres actifs');
    return parts.length ? parts.join(' — ') : undefined;
  }, [listSort, hasActiveFilters]);

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Expéditions colis (Douala)',
      fileName: `expeditions_colis_${new Date().toISOString().split('T')[0]}.xlsx`,
      filtersDescription: exportSortLine,
      columns: [
        { header: 'Réf.', value: (ex) => ex.reference },
        { header: 'Origine', value: (ex) => ex.origine },
        { header: 'Destination', value: (ex) => ex.destination },
        { header: 'Départ', value: (ex) => dateLocaleOrDash(ex.dateDepart) },
        { header: 'Arrivée', value: (ex) => dateLocaleOrDash(ex.dateArrivee) },
        { header: 'Création fiche', value: (ex) => dateLocaleOrDash(ex.dateCreation) },
        { header: 'Statut', value: (ex) => formatTripStatusFr(ex.statut) },
        { header: 'Chauffeur', value: (ex) => driverLabel(ex.chauffeurId) },
        { header: 'Tél. chauffeur', value: (ex) => driverPhone(ex.chauffeurId) },
        { header: 'Camions (tract. + rem.)', value: (ex) => truckBits(ex.tracteurId, ex.remorqueuseId) },
        { header: 'Nb opérations', value: (ex) => ex.lots.length },
        {
          header: 'Total FCFA',
          value: (ex) => sumExpeditionMontant(ex.lots).toLocaleString('fr-FR'),
        },
        {
          header: 'Notes expédition',
          value: (ex) => (ex.description?.trim() ? ex.description : '—'),
        },
        {
          header: 'Détail lignes (client · unité · qté · PU · montant · obs.)',
          value: (ex) =>
            ex.lots
              .map((l) => {
                const obs = l.observations?.trim();
                const base = `${l.clients}: ${l.quantite} ${l.unite} × ${l.prixUnitaire} = ${l.montant}`;
                return obs ? `${base} (${obs})` : base;
              })
              .join(' | '),
        },
      ],
      rows: sorted,
    });
  };

  const handleExportPDF = () => {
    exportToPrintablePDF({
      title: 'Expéditions colis (Douala)',
      fileName: `expeditions_colis_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: exportSortLine,
      headerColor: '#0284c7',
      headerTextColor: '#ffffff',
      evenRowColor: '#f0f9ff',
      oddRowColor: '#ffffff',
      accentColor: '#0284c7',
      totals: [
        { label: 'Expéditions (liste)', value: sorted.length, style: 'neutral', icon: EMOJI.liste },
        {
          label: 'CA liste (FCFA)',
          value: sorted.reduce((s, ex) => s + sumExpeditionMontant(ex.lots), 0).toLocaleString('fr-FR'),
          style: 'neutral',
          icon: EMOJI.liste,
        },
        { label: 'En cours + planifiées', value: counts.planifie + counts.en_cours, style: 'neutral', icon: EMOJI.date },
        { label: 'Terminées', value: counts.termine, style: 'positive', icon: EMOJI.ok },
      ],
      columns: [
        { header: 'Réf.', value: (ex) => ex.reference },
        {
          header: 'Itinéraire',
          value: (ex) => `${ex.origine} → ${ex.destination}`,
        },
        { header: 'Départ', value: (ex) => dateLocaleOrDash(ex.dateDepart) },
        { header: 'Arrivée', value: (ex) => dateLocaleOrDash(ex.dateArrivee) },
        { header: 'Statut', value: (ex) => formatTripStatusFr(ex.statut) },
        { header: 'Chauffeur', value: (ex) => driverLabel(ex.chauffeurId) },
        { header: 'Tél.', value: (ex) => driverPhone(ex.chauffeurId) },
        { header: 'Camions', value: (ex) => truckBits(ex.tracteurId, ex.remorqueuseId) },
        { header: 'Opér.', value: (ex) => ex.lots.length },
        {
          header: 'Total',
          value: (ex) => formatFcfa(sumExpeditionMontant(ex.lots)),
        },
        {
          header: 'Notes',
          value: (ex) => {
            const d = ex.description?.trim();
            if (!d) return '—';
            return d.length > 100 ? `${d.slice(0, 97)}…` : d;
          },
        },
      ],
      rows: sorted,
    });
  };

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Expéditions"
        description="Expéditions groupées depuis Douala : pour chaque ligne, clients, unité, quantité, prix unitaire et montant (FCFA), avec observations — idéal pour le suivi commercial du colis."
        icon={Package}
        gradient="from-sky-500/20 via-cyan-500/10 to-transparent"
        actions={
          <div className="flex flex-wrap gap-2">
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
                    Nouvelle expédition
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[98vw] max-w-5xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editing ? 'Modifier l’expédition' : 'Nouvelle expédition colis'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                      <p className="font-medium text-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-sky-600" />
                        Origine fixe : {ORIGIN_NAME}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        Toutes les expéditions partent de Douala. Choisissez la destination et regroupez les
                        opérations clients (plusieurs lignes tarifées) sur un seul départ.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="ref">Référence</Label>
                        <Input
                          id="ref"
                          value={form.reference}
                          onChange={(e) => setForm({ ...form, reference: e.target.value })}
                          placeholder={defaultReference()}
                        />
                      </div>
                      <div>
                        <Label>Destination *</Label>
                        <div className="flex gap-2">
                          <Input
                            value={form.destination}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                destination: e.target.value,
                                destinationLat: undefined,
                                destinationLng: undefined,
                              })
                            }
                            placeholder="Ville d’arrivée"
                            required
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setDestPickerOpen(true)}
                            title="Choisir une ville"
                          >
                            <MapPin className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>
                          Tracteur
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({tracteurs.length} dispo.)
                          </span>
                        </Label>
                        <Select
                          value={form.tracteurId || 'none'}
                          onValueChange={(value) => {
                            const tracteurId = value === 'none' ? '' : value;
                            const selectedTruck = trucks.find((t) => t.id === tracteurId);
                            const att = selectedTruck?.chauffeurId || '';
                            setForm((prev) => ({
                              ...prev,
                              tracteurId,
                              chauffeurId: att || prev.chauffeurId,
                            }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Aucun</SelectItem>
                            {tracteurs.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.immatriculation} — {t.modele}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>
                          Remorqueuse
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({remorqueuses.length} dispo.)
                          </span>
                        </Label>
                        <Select
                          value={form.remorqueuseId || 'none'}
                          onValueChange={(value) =>
                            setForm({ ...form, remorqueuseId: value === 'none' ? '' : value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Aucune</SelectItem>
                            {remorqueuses.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.immatriculation} — {t.modele}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>
                        Chauffeur *
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({availableDrivers.length} dispo.)
                        </span>
                      </Label>
                      <Select
                        value={form.chauffeurId}
                        onValueChange={(value) => setForm({ ...form, chauffeurId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chauffeur" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDrivers.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                              Aucun chauffeur libre (trajets + expéditions actives).
                            </div>
                          ) : (
                            availableDrivers.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.prenom} {d.nom}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="dd">Date de départ *</Label>
                        <Input
                          id="dd"
                          type="date"
                          value={form.dateDepart}
                          onChange={(e) => setForm({ ...form, dateDepart: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="da">Date d’arrivée (optionnel)</Label>
                        <Input
                          id="da"
                          type="date"
                          value={form.dateArrivee}
                          onChange={(e) => setForm({ ...form, dateArrivee: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Statut</Label>
                        <Select
                          value={form.statut}
                          onValueChange={(v) => setForm({ ...form, statut: v as TripStatus })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="planifie">{formatTripStatusFr('planifie')}</SelectItem>
                            <SelectItem value="en_cours">{formatTripStatusFr('en_cours')}</SelectItem>
                            <SelectItem value="termine">{formatTripStatusFr('termine')}</SelectItem>
                            <SelectItem value="annule">{formatTripStatusFr('annule')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <datalist id="unites-colis-suggestions">
                      {UNITE_SUGGESTIONS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Lignes d’opération (clients &amp; tarification)
                        </Label>
                        <Button type="button" variant="outline" size="sm" onClick={addLotRow}>
                          <Plus className="h-3 w-3 mr-1" />
                          Ligne
                        </Button>
                      </div>
                      <div className="rounded-md border overflow-x-auto">
                        <Table className="min-w-[920px]">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[140px]">Client(s) *</TableHead>
                              <TableHead className="min-w-[100px]">Unité *</TableHead>
                              <TableHead className="w-24 text-right">Qté *</TableHead>
                              <TableHead className="w-32 text-right">Prix unit. *</TableHead>
                              <TableHead className="w-36 text-right">Montant</TableHead>
                              <TableHead className="min-w-[160px]">Observations</TableHead>
                              <TableHead className="w-12 text-right" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {form.lots.map((lot) => (
                              <TableRow key={lot.id}>
                                <TableCell className="align-top">
                                  <Input
                                    value={lot.clients}
                                    onChange={(e) =>
                                      updateLot(lot.id, { clients: e.target.value })
                                    }
                                    placeholder="Ex. M. Ngo, Société Kribi"
                                  />
                                </TableCell>
                                <TableCell className="align-top">
                                  <Input
                                    list="unites-colis-suggestions"
                                    value={lot.unite}
                                    onChange={(e) =>
                                      updateLot(lot.id, { unite: e.target.value })
                                    }
                                    placeholder="carton, sac…"
                                  />
                                </TableCell>
                                <TableCell className="align-top">
                                  <Input
                                    type="number"
                                    min={0.01}
                                    step={0.01}
                                    className="text-right tabular-nums"
                                    value={lot.quantite}
                                    onChange={(e) =>
                                      updateLot(lot.id, {
                                        quantite: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="align-top">
                                  <Input
                                    type="number"
                                    min={0}
                                    step={100}
                                    className="text-right tabular-nums"
                                    value={lot.prixUnitaire}
                                    onChange={(e) =>
                                      updateLot(lot.id, {
                                        prixUnitaire: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell className="align-top text-right tabular-nums text-sm font-medium pt-2.5">
                                  {formatFcfa(lot.montant)}
                                </TableCell>
                                <TableCell className="align-top">
                                  <Input
                                    value={lot.observations ?? ''}
                                    onChange={(e) =>
                                      updateLot(lot.id, { observations: e.target.value })
                                    }
                                    placeholder="Fragile, bon de livraison…"
                                  />
                                </TableCell>
                                <TableCell className="text-right align-top">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => removeLotRow(lot.id)}
                                    title="Retirer la ligne"
                                  >
                                    <MinusCircle className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">
                          Montant = quantité × prix unitaire (arrondi FCFA).
                        </span>
                        <span className="font-semibold tabular-nums">
                          Sous-total : {formatFcfa(sumExpeditionMontant(form.lots))}
                        </span>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="prefinancement">Préfinancement (FCFA)</Label>
                      <Input
                        id="prefinancement"
                        type="number"
                        min={0}
                        step={500}
                        value={form.prefinancement}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            prefinancement: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Enregistré automatiquement en dépense à la création de l&apos;expédition.
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="commissionPct">Commission société (%)</Label>
                      <Input
                        id="commissionPct"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={form.commissionPct}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            commissionPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                          })
                        }
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Commission estimée : {formatFcfa(Math.round(sumExpeditionMontant(form.lots) * (form.commissionPct / 100)))}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="desc">Notes expédition</Label>
                      <Textarea
                        id="desc"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        rows={2}
                        placeholder="Instructions globales, numéro de bon…"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Annuler
                      </Button>
                      <Button type="submit">{editing ? 'Enregistrer' : 'Créer'}</Button>
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

      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-5 w-5" />
              Filtres de recherche
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {isLoading && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Synchronisation API…
                </span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => void refreshParcelExpeditions()}
              >
                Recharger la liste
              </Button>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={resetFilters} className="text-xs">
                  <X className="h-3 w-3 mr-1" />
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="parcel-search">Recherche</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="parcel-search"
                className="pl-9"
                placeholder="Référence, destination, clients, unité, montants…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>Destination</Label>
              <Select value={filterDestination} onValueChange={setFilterDestination}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les destinations</SelectItem>
                  {CAMEROON_CITIES.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                  {allDestinations
                    .filter((d) => !CAMEROON_CITIES.some((c) => c.name === d))
                    .map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chauffeur</Label>
              <Select value={filterChauffeurId} onValueChange={setFilterChauffeurId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les chauffeurs</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.prenom} {d.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Statut</Label>
              <Select value={filterStatut} onValueChange={setFilterStatut}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {(['planifie', 'en_cours', 'termine', 'annule'] as TripStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {formatTripStatusFr(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tracteur (expédition)</Label>
              <Select value={filterTracteurId} onValueChange={setFilterTracteurId}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les tracteurs</SelectItem>
                  {trucks
                    .filter((t) => t.type === 'tracteur')
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.immatriculation} — {t.modele}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Remorqueuse (expédition)</Label>
              <Select value={filterRemorqueuseId} onValueChange={setFilterRemorqueuseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les remorqueuses</SelectItem>
                  {trucks
                    .filter((t) => t.type === 'remorqueuse')
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.immatriculation} — {t.modele}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fdf">Départ du</Label>
              <Input
                id="fdf"
                type="date"
                value={filterDateDepartFrom}
                onChange={(e) => setFilterDateDepartFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fdt">Départ au</Label>
              <Input
                id="fdt"
                type="date"
                value={filterDateDepartTo}
                onChange={(e) => setFilterDateDepartTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <ListSortSelect
                id="sort-expeditions"
                value={listSort}
                onChange={setListSort}
                options={[...EXPEDITION_SORT_OPTIONS]}
                className="w-full"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <div className="rounded-lg border border-primary/10 bg-muted/50 px-4 py-2 text-sm">
              <span className="font-medium text-primary">
                {sorted.length} expédition(s) sur {parcelExpeditions.length} correspondent aux filtres
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {(['planifie', 'en_cours', 'termine', 'annule'] as TripStatus[]).map((s) => (
          <Card key={s}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {formatTripStatusFr(s)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold tabular-nums">{counts[s]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Liste des expéditions</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 border-sky-200 bg-sky-50/60">
            <Info className="h-4 w-4" />
            <AlertTitle>Facturation des expéditions</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                La création d’une expédition <span className="font-medium">ne génère pas automatiquement</span> une
                facture. Le cas apparaît dans l’écran `Factures` au moment de créer une nouvelle facture de type
                `Expédition`.
              </p>
              {canManageAccounting && (
                <p>
                  Vous pouvez ouvrir directement la création ici via le bouton `Facturer`.
                </p>
              )}
            </AlertDescription>
          </Alert>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1020px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Réf.</TableHead>
                  <TableHead>Itinéraire</TableHead>
                  <TableHead>Départ</TableHead>
                  <TableHead>Chauffeur</TableHead>
                  <TableHead>Camions</TableHead>
                  <TableHead className="text-center">Lignes</TableHead>
                  <TableHead className="text-right">Total FCFA</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      {parcelExpeditions.length === 0
                        ? 'Aucune expédition. Créez un envoi groupé Douala → destination.'
                        : hasActiveFilters
                          ? 'Aucune expédition ne correspond aux filtres sélectionnés.'
                          : 'Aucune expédition.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((ex) => (
                    <TableRow key={ex.id}>
                      <TableCell className="font-mono text-sm">{ex.reference}</TableCell>
                      <TableCell>
                        <span className="font-medium">{ex.origine}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span>{ex.destination}</span>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {ex.lots.map((l) => l.clients).filter(Boolean).join(' · ') || '—'}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(ex.dateDepart).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-sm">{driverLabel(ex.chauffeurId)}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {truckBits(ex.tracteurId, ex.remorqueuseId)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{ex.lots.length}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatFcfa(sumExpeditionMontant(ex.lots))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statutBadgeVariant(ex.statut)}>
                          {formatTripStatusFr(ex.statut)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setViewing(ex)} title="Consulter">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManageAccounting && !getInvoiceForExpedition(ex.id) && (
                            <Button asChild variant="outline" size="sm" title="Créer la facture">
                              <Link to={`/factures?create=1&parcelExpeditionId=${encodeURIComponent(ex.id)}`}>
                                <Receipt className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          {canManageAccounting && getInvoiceForExpedition(ex.id) && (
                            <Button asChild variant="outline" size="sm" title="Voir la facture associée">
                              <Link to="/factures">
                                <Receipt className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        {canManageFleet && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openEdit(ex)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDelete(ex.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="w-[96vw] max-w-5xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Expédition {viewing.reference} — {viewing.origine} → {viewing.destination}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Statut & dates</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Statut</span>
                        <Badge variant={statutBadgeVariant(viewing.statut)}>
                          {formatTripStatusFr(viewing.statut)}
                        </Badge>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Départ</span>
                        <span>{dateLocaleOrDash(viewing.dateDepart)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Arrivée</span>
                        <span>{dateLocaleOrDash(viewing.dateArrivee)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Création</span>
                        <span>{dateLocaleOrDash(viewing.dateCreation)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Affectation</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Chauffeur</span>
                        <span className="text-right">{driverLabel(viewing.chauffeurId)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Téléphone</span>
                        <span>{driverPhone(viewing.chauffeurId)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Camions</span>
                        <span className="text-right font-mono">{truckBits(viewing.tracteurId, viewing.remorqueuseId)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Récipients / clients</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Différents recipients</span>
                        <span>{[...new Set(viewing.lots.map((l) => l.clients?.trim()).filter(Boolean))].length}</span>
                      </div>
                      <p className="text-sm">{recipientsSummary(viewing)}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Valeurs</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">CA total</span>
                        <span className="font-semibold">{formatFcfa(sumExpeditionMontant(viewing.lots))}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Commission</span>
                        <span>
                          {(viewing.commissionPct ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}% · {formatFcfa(commissionAmount(viewing))}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Net estimé</span>
                        <span className="font-semibold">
                          {formatFcfa(sumExpeditionMontant(viewing.lots) - commissionAmount(viewing))}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Détail des produits / lignes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                      <Table className="min-w-[920px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Recipient / client</TableHead>
                            <TableHead>Produit / observations</TableHead>
                            <TableHead>Unité</TableHead>
                            <TableHead className="text-right">Qté</TableHead>
                            <TableHead className="text-right">Valeur unitaire</TableHead>
                            <TableHead className="text-right">Valeur totale</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {viewing.lots.map((lot) => (
                            <TableRow key={lot.id}>
                              <TableCell className="font-medium">{lot.clients}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{lot.observations || '—'}</TableCell>
                              <TableCell>{lot.unite}</TableCell>
                              <TableCell className="text-right">{lot.quantite.toLocaleString('fr-FR')}</TableCell>
                              <TableCell className="text-right">{formatFcfa(lot.prixUnitaire)}</TableCell>
                              <TableCell className="text-right font-semibold">{formatFcfa(lot.montant)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {viewing.description?.trim() && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Notes expédition</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {viewing.description}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Facturation</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    {(() => {
                      const linkedInvoice = getInvoiceForExpedition(viewing.id);
                      if (linkedInvoice) {
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">Facture liée : {linkedInvoice.numero}</p>
                              <p className="text-muted-foreground">
                                Montant TTC : {linkedInvoice.montantTTC.toLocaleString('fr-FR')} FCFA
                              </p>
                            </div>
                            <Button asChild variant="outline">
                              <Link to="/factures">Ouvrir les factures</Link>
                            </Button>
                          </div>
                        );
                      }

                      return (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">Aucune facture créée pour cet envoi.</p>
                            <p className="text-muted-foreground">
                              Les cas `Expédition` deviennent facturables dans l’écran `Factures`, mais la facture doit être créée séparément.
                            </p>
                          </div>
                          {canManageAccounting && (
                            <Button asChild>
                              <Link to={`/factures?create=1&parcelExpeditionId=${encodeURIComponent(viewing.id)}`}>
                                Créer la facture
                              </Link>
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CityPicker
        open={destPickerOpen}
        onClose={() => setDestPickerOpen(false)}
        onSelectCity={(name, coords) => {
          setForm((f) => ({
            ...f,
            destination: name,
            destinationLat: coords?.lat,
            destinationLng: coords?.lng,
          }));
        }}
      />
    </div>
  );
}
