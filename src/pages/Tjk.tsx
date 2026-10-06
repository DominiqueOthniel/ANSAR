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
import { isLoadingFinished, isLoadingOpenForSelection } from '@/lib/supplier-loadings';
import {
  type TjkOperation,
  createTjkOperation,
  deleteTjkOperation,
  formatTjkCamionLabel,
  formatTjkClientLabel,
  refreshTjkOperationsFromApi,
  updateTjkOperation,
} from '@/lib/tjk-operations';
import {
  type TjkDestination,
  createTjkDestination,
  deleteTjkDestination,
  findTjkDestinationByLibelle,
  refreshTjkDestinationsFromApi,
  updateTjkDestination,
} from '@/lib/tjk-destinations';
import {
  TJK_DEFAULT_UNIT_WEIGHT_KG,
  tjkQuantiteToQtesTonnage,
} from '@/lib/tjk-quantities';

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
  tjkDestinationId: string;
  /** Poids unitaire (kg) pour le calcul automatique du tonnage. */
  poidsUniteKg: number;
  quantite: number | undefined;
  unite: string;
  qualite: string;
  destination: string;
  camionNom: string;
  camionImmatriculation: string;
  referenceAtc: string;
  supplierLoadingId: string;
  qtes: number | undefined;
  tonnage: number | undefined;
  telChauffeur: string;
  prixTrans: number | undefined;
  paiement: number | undefined;
  notes: string;
  /** Infos financières (toutes optionnelles). */
  soldeAnterieur: number | undefined;
  nombreCamions: number | undefined;
  tonnageTotal: number | undefined;
  resteAPayer: number | undefined;
  prixTransport: number | undefined;
  totalTransport: number | undefined;
  prixVoyage: number | undefined;
  totalPaiement: number | undefined;
};

type DestFormState = {
  libelle: string;
  quantiteDefaut: number | undefined;
  poidsUniteKg: number | undefined;
  prixTrans: number | undefined;
  prixTransport: number | undefined;
  totalTransport: number | undefined;
  prixVoyage: number | undefined;
  totalPaiement: number | undefined;
};

const emptyDestForm = (): DestFormState => ({
  libelle: '',
  quantiteDefaut: undefined,
  poidsUniteKg: TJK_DEFAULT_UNIT_WEIGHT_KG,
  prixTrans: undefined,
  prixTransport: undefined,
  totalTransport: undefined,
  prixVoyage: undefined,
  totalPaiement: undefined,
});

function withQuantiteSynced(prev: FormState, quantite: number | undefined): FormState {
  const { qtes, tonnage } = tjkQuantiteToQtesTonnage(quantite, prev.poidsUniteKg);
  return { ...prev, quantite, qtes, tonnage };
}

function mergeDestinationIntoForm(dest: TjkDestination, prev: FormState): FormState {
  const poids = dest.poidsUniteKg ?? TJK_DEFAULT_UNIT_WEIGHT_KG;
  const quantite =
    prev.quantite != null && prev.quantite > 0
      ? prev.quantite
      : dest.quantiteDefaut != null && dest.quantiteDefaut > 0
        ? dest.quantiteDefaut
        : prev.quantite;
  const base: FormState = {
    ...prev,
    tjkDestinationId: dest.id,
    destination: dest.libelle,
    poidsUniteKg: poids,
    prixTrans: dest.prixTrans ?? prev.prixTrans,
    prixTransport: dest.prixTransport ?? dest.prixTrans ?? prev.prixTransport,
    totalTransport: dest.totalTransport ?? prev.totalTransport,
    prixVoyage: dest.prixVoyage ?? prev.prixVoyage,
    totalPaiement: dest.totalPaiement ?? prev.totalPaiement,
    quantite,
  };
  return withQuantiteSynced(base, quantite);
}

const emptyForm = (): FormState => ({
  date: todayIso(),
  clientId: '',
  clientNom: '',
  tjkDestinationId: '',
  poidsUniteKg: TJK_DEFAULT_UNIT_WEIGHT_KG,
  quantite: undefined,
  unite: '',
  qualite: '',
  destination: '',
  camionNom: '',
  camionImmatriculation: '',
  referenceAtc: '',
  supplierLoadingId: '',
  qtes: undefined,
  tonnage: undefined,
  telChauffeur: '',
  prixTrans: undefined,
  paiement: undefined,
  notes: '',
  soldeAnterieur: undefined,
  nombreCamions: undefined,
  tonnageTotal: undefined,
  resteAPayer: undefined,
  prixTransport: undefined,
  totalTransport: undefined,
  prixVoyage: undefined,
  totalPaiement: undefined,
});

export default function Tjk() {
  const { thirdParties, merchandiseQualities, supplierLoadings, updateSupplierLoading } = useApp();
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
  const [destinations, setDestinations] = useState<TjkDestination[]>([]);
  const [destDialogOpen, setDestDialogOpen] = useState(false);
  const [editingDest, setEditingDest] = useState<TjkDestination | null>(null);
  const [destForm, setDestForm] = useState<DestFormState>(emptyDestForm);

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

  const sortedDestinations = useMemo(
    () =>
      stableSort(
        destinations.filter((d) => d.libelle.trim()),
        (a, b) => frCollator.compare(a.libelle, b.libelle),
      ),
    [destinations],
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
      .filter((row) => {
        if (isLoadingFinished(row.loading.statut, row.loading.quantite, row.loading.assignments)) {
          return false;
        }
        if (row.total > 0) return row.reste > 1e-6;
        return row.used <= 1e-6;
      });
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
    const quantite =
      prev.quantite != null && prev.quantite > 0
        ? prev.quantite
        : reste != null && reste > 0
          ? reste
          : prev.quantite;
    return withQuantiteSynced(
      {
        ...prev,
        supplierLoadingId: loadingId,
        referenceAtc: bon.numeroBon?.trim() || prev.referenceAtc,
        qualite: bon.designation?.trim() || prev.qualite,
        unite: bon.unite?.trim() || prev.unite,
        date: bon.dateChargement || prev.date,
      },
      quantite,
    );
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rows, destRows] = await Promise.all([
        refreshTjkOperationsFromApi(),
        refreshTjkDestinationsFromApi(),
      ]);
      setOperations(rows);
      setDestinations(destRows);
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
        (op.telChauffeur ?? '').toLowerCase().includes(q) ||
        (op.notes ?? '').toLowerCase().includes(q) ||
        (op.telChauffeur ?? '').toLowerCase().includes(q) ||
        (op.unite ?? '').toLowerCase().includes(q) ||
        String(op.quantite).includes(q) ||
        (op.soldeAnterieur && String(op.soldeAnterieur).includes(q)) ||
        (op.nombreCamions && String(op.nombreCamions).includes(q)) ||
        (op.tonnageTotal && String(op.tonnageTotal).includes(q)) ||
        (op.qtfs && String(op.qtfs).includes(q)) ||
        (op.tonnage && String(op.tonnage).includes(q)) ||
        (op.resteAPayer && String(op.resteAPayer).includes(q)) ||
        (op.prixTransport && String(op.prixTransport).includes(q)) ||
        (op.totalTransport && String(op.totalTransport).includes(q)) ||
        (op.prixVoyage && String(op.prixVoyage).includes(q)) ||
        (op.totalPalemarr && String(op.totalPalemarr).includes(q))
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
    const matched = findTjkDestinationByLibelle(destinations, op.destination || '');
    setForm({
      date: op.date.split('T')[0] || op.date,
      clientId: op.clientId || '',
      clientNom: op.clientNom || '',
      tjkDestinationId: matched?.id || '',
      poidsUniteKg: matched?.poidsUniteKg ?? TJK_DEFAULT_UNIT_WEIGHT_KG,
      quantite: op.quantite,
      unite: op.unite || '',
      qualite: op.qualite || '',
      destination: op.destination || '',
      camionNom: op.camionNom || '',
      camionImmatriculation: op.camionImmatriculation || '',
      referenceAtc: op.referenceAtc || '',
      supplierLoadingId: op.supplierLoadingId || '',
      qtes: op.qtes ?? op.qtfs ?? op.quantite,
      tonnage: op.tonnage,
      telChauffeur: op.telChauffeur || '',
      prixTrans: op.prixTrans ?? op.prixTransport,
      paiement: op.paiement,
      notes: op.notes || '',
      soldeAnterieur: op.soldeAnterieur,
      nombreCamions: op.nombreCamions,
      tonnageTotal: op.tonnageTotal,
      resteAPayer: op.resteAPayer,
      prixTransport: op.prixTransport ?? op.prixTrans,
      totalTransport: op.totalTransport,
      prixVoyage: op.prixVoyage,
      totalPaiement: op.totalPalemarr,
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
    const qtesVal =
      form.qtes != null && Number.isFinite(Number(form.qtes))
        ? Number(form.qtes)
        : q;
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
      qtes: qtesVal,
      tonnage:
        form.tonnage != null && Number.isFinite(Number(form.tonnage))
          ? Number(form.tonnage)
          : null,
      telChauffeur: form.telChauffeur.trim() || undefined,
      prixTrans:
        form.prixTrans != null && Number.isFinite(Number(form.prixTrans))
          ? Number(form.prixTrans)
          : null,
      paiement:
        form.paiement != null && Number.isFinite(Number(form.paiement))
          ? Number(form.paiement)
          : null,
      notes: form.notes.trim() || undefined,
      utilisateur: user?.login || 'system',
      soldeAnterieur: form.soldeAnterieur,
      nombreCamions: form.nombreCamions,
      tonnageTotal: form.tonnageTotal,
      qtfs: qtesVal,
      resteAPayer: form.resteAPayer,
      prixTransport:
        form.prixTransport != null && Number.isFinite(Number(form.prixTransport))
          ? Number(form.prixTransport)
          : form.prixTrans != null && Number.isFinite(Number(form.prixTrans))
            ? Number(form.prixTrans)
            : null,
      totalTransport: form.totalTransport,
      prixVoyage: form.prixVoyage,
      totalPalemarr: form.totalPaiement,
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
        if (form.supplierLoadingId) {
          const bon = tjkLoadings.find((l) => l.id === form.supplierLoadingId);
          if (bon?.quantite != null && bon.quantite > 0) {
            const usedAfter = ventilatedQtyForLoading(
              form.supplierLoadingId,
              [
                ...operations.filter((op) => op.id !== editing?.id),
                {
                  id: editing?.id || 'new',
                  date: form.date,
                  quantite: q,
                  supplierLoadingId: form.supplierLoadingId,
                },
              ],
            );
            if (usedAfter + 1e-6 >= bon.quantite) {
              try {
                await updateSupplierLoading(form.supplierLoadingId, { statut: 'affecte' });
              } catch (e) {
                console.error('mark tjk bon affecte', e);
              }
            }
          }
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

  const resetDestForm = () => {
    setDestForm(emptyDestForm());
    setEditingDest(null);
  };

  const openCreateDest = () => {
    resetDestForm();
    setDestDialogOpen(true);
  };

  const openEditDest = (dest: TjkDestination) => {
    setEditingDest(dest);
    setDestForm({
      libelle: dest.libelle,
      quantiteDefaut: dest.quantiteDefaut,
      poidsUniteKg: dest.poidsUniteKg ?? TJK_DEFAULT_UNIT_WEIGHT_KG,
      prixTrans: dest.prixTrans,
      prixTransport: dest.prixTransport,
      totalTransport: dest.totalTransport,
      prixVoyage: dest.prixVoyage,
      totalPaiement: dest.totalPaiement,
    });
    setDestDialogOpen(true);
  };

  const handleDestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const libelle = destForm.libelle.trim();
    if (!libelle) {
      toast.error('Indiquez le nom de la destination.');
      return;
    }
    const payload = {
      libelle,
      quantiteDefaut: destForm.quantiteDefaut,
      poidsUniteKg: destForm.poidsUniteKg ?? TJK_DEFAULT_UNIT_WEIGHT_KG,
      prixTrans: destForm.prixTrans,
      prixTransport: destForm.prixTransport,
      totalTransport: destForm.totalTransport,
      prixVoyage: destForm.prixVoyage,
      totalPaiement: destForm.totalPaiement,
    };
    await withGuard(async () => {
      try {
        if (editingDest) {
          await updateTjkDestination(editingDest.id, payload);
          toast.success('Destination mise à jour.');
        } else {
          await createTjkDestination(payload);
          toast.success('Destination enregistrée.');
        }
        setDestinations(await refreshTjkDestinationsFromApi());
        setDestDialogOpen(false);
        resetDestForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur enregistrement.');
      }
    });
  };

  const handleDestDelete = async (id: string) => {
    if (!confirm('Supprimer cette destination TJK ?')) return;
    try {
      await deleteTjkDestination(id);
      setDestinations(await refreshTjkDestinationsFromApi());
      toast.success('Destination supprimée.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur suppression.');
    }
  };

  const listSummary = useMemo(() => {
    const nbreCam = new Set(
      sorted
        .map((op) =>
          [op.camionNom?.trim(), op.camionImmatriculation?.trim()]
            .filter(Boolean)
            .join('|'),
        )
        .filter(Boolean),
    ).size;
    const tonnageTotal = sorted.reduce((s, op) => s + (Number(op.tonnage) || 0), 0);
    const prixTransTotal = sorted.reduce(
      (s, op) => s + (Number(op.prixTrans) || 0),
      0,
    );
    const totalPaiement = sorted.reduce(
      (s, op) => s + (Number(op.paiement) || 0),
      0,
    );
    const resteAPayer = Math.max(0, prixTransTotal - totalPaiement);
    return { nbreCam, tonnageTotal, prixTransTotal, totalPaiement, resteAPayer };
  }, [sorted]);

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
    { header: 'N° camion', value: (op: TjkOperation) => formatTjkCamionLabel(op) },
    { header: 'ATC', value: (op: TjkOperation) => op.referenceAtc || '' },
    {
      header: 'Qtes',
      value: (op: TjkOperation) =>
        (op.qtes ?? op.quantite).toLocaleString('fr-FR'),
    },
    {
      header: 'Tonnage',
      value: (op: TjkOperation) =>
        op.tonnage != null ? op.tonnage.toLocaleString('fr-FR') : '',
    },
    { header: 'Tel chauf', value: (op: TjkOperation) => op.telChauffeur || '' },
    {
      header: 'Prix TRANS',
      value: (op: TjkOperation) =>
        op.prixTrans != null ? op.prixTrans.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Paiement',
      value: (op: TjkOperation) =>
        op.paiement != null ? op.paiement.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Solde antérieur',
      value: (op: TjkOperation) =>
        op.soldeAnterieur ? op.soldeAnterieur.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Nbre Camions',
      value: (op: TjkOperation) =>
        op.nombreCamions ? op.nombreCamions.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Tonnage Total',
      value: (op: TjkOperation) =>
        op.tonnageTotal ? op.tonnageTotal.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Qtes',
      value: (op: TjkOperation) =>
        (op.qtfs ?? op.qtes ?? op.quantite)?.toLocaleString('fr-FR') ?? '',
    },
    {
      header: 'Reste à Payer',
      value: (op: TjkOperation) =>
        op.resteAPayer ? op.resteAPayer.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Prix Transport',
      value: (op: TjkOperation) =>
        (op.prixTransport ?? op.prixTrans)
          ? (op.prixTransport ?? op.prixTrans)!.toLocaleString('fr-FR')
          : '',
    },
    {
      header: 'Total Transport',
      value: (op: TjkOperation) =>
        op.totalTransport ? op.totalTransport.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Prix Voyage',
      value: (op: TjkOperation) =>
        op.prixVoyage ? op.prixVoyage.toLocaleString('fr-FR') : '',
    },
    {
      header: 'Total paiement',
      value: (op: TjkOperation) =>
        (op.totalPalemarr ?? op.paiement)
          ? (op.totalPalemarr ?? op.paiement)!.toLocaleString('fr-FR')
          : '',
    },
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
                          {tjkLoadings
                            .filter((l) =>
                              isLoadingOpenForSelection(l, {
                                keepLoadingId: form.supplierLoadingId || undefined,
                              }) &&
                              (() => {
                                const used = ventilatedQtyForLoading(
                                  l.id,
                                  operations,
                                  editing?.id,
                                );
                                if (l.quantite != null && l.quantite > 0) {
                                  return (
                                    l.quantite - used > 1e-6 ||
                                    l.id === form.supplierLoadingId
                                  );
                                }
                                return used <= 1e-6 || l.id === form.supplierLoadingId;
                              })(),
                            )
                            .map((l) => {
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
                          onChange={(quantite) =>
                            setForm((f) => withQuantiteSynced(f, quantite))
                          }
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

                    <div className="space-y-2">
                      <Label htmlFor="tjk-dest">Destination *</Label>
                      <Input
                        id="tjk-dest"
                        value={form.destination}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            destination: e.target.value,
                            tjkDestinationId: '',
                          }))
                        }
                        required
                        placeholder="Ville / site"
                      />
                      {sortedDestinations.length > 0 && (
                        <Select
                          value={form.tjkDestinationId || '__none__'}
                          onValueChange={(v) => {
                            if (v === '__none__') {
                              setForm((f) => ({ ...f, tjkDestinationId: '' }));
                              return;
                            }
                            const dest = destinations.find((d) => d.id === v);
                            if (dest) setForm((f) => mergeDestinationIntoForm(dest, f));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une destination enregistrée…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Saisie libre</SelectItem>
                            {sortedDestinations.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.libelle}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Une destination enregistrée préremplit les montants forfaitaires du
                        formulaire.
                      </p>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="tjk-qtes">Qtes</Label>
                        <NumberInput
                          id="tjk-qtes"
                          value={form.qtes}
                          onChange={(qtes) => setForm((f) => ({ ...f, qtes }))}
                          min={0}
                          allowEmpty
                          placeholder="Calculé depuis la quantité"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Calcul automatique = quantité (modifiable).
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="tjk-tonnage">Tonnage</Label>
                        <NumberInput
                          id="tjk-tonnage"
                          value={form.tonnage}
                          onChange={(tonnage) => setForm((f) => ({ ...f, tonnage }))}
                          min={0}
                          allowEmpty
                          placeholder="Calculé (sacs × kg / 1000)"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {form.poidsUniteKg} kg/unité → tonnage auto depuis la quantité.
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="tjk-tel">Tel chauf</Label>
                      <Input
                        id="tjk-tel"
                        value={form.telChauffeur}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, telChauffeur: e.target.value }))
                        }
                        placeholder="Ex. 690456268"
                        inputMode="tel"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="tjk-prix">Prix TRANS</Label>
                        <NumberInput
                          id="tjk-prix"
                          value={form.prixTrans}
                          onChange={(prixTrans) =>
                            setForm((f) => ({ ...f, prixTrans }))
                          }
                          min={0}
                          allowEmpty
                          placeholder="FCFA"
                        />
                      </div>
                      <div>
                        <Label htmlFor="tjk-paiement">Paiement</Label>
                        <NumberInput
                          id="tjk-paiement"
                          value={form.paiement}
                          onChange={(paiement) =>
                            setForm((f) => ({ ...f, paiement }))
                          }
                          min={0}
                          allowEmpty
                          placeholder="FCFA"
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4 space-y-4">
                      <div>
                        <h3 className="font-medium text-sm">Informations financières</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Remplissage optionnel.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="tjk-solde-anterieur">Solde antérieur</Label>
                          <NumberInput
                            id="tjk-solde-anterieur"
                            value={form.soldeAnterieur}
                            onChange={(soldeAnterieur) =>
                              setForm((f) => ({ ...f, soldeAnterieur }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 1000000"
                          />
                        </div>
                        <div>
                          <Label htmlFor="tjk-nombre-camions">Nombre de camions</Label>
                          <NumberInput
                            id="tjk-nombre-camions"
                            value={form.nombreCamions}
                            onChange={(nombreCamions) =>
                              setForm((f) => ({ ...f, nombreCamions }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 2"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="tjk-tonnage-total">Tonnage total</Label>
                          <NumberInput
                            id="tjk-tonnage-total"
                            value={form.tonnageTotal}
                            onChange={(tonnageTotal) =>
                              setForm((f) => ({ ...f, tonnageTotal }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 2048"
                          />
                        </div>
                        <div>
                          <Label htmlFor="tjk-reste-a-payer">Reste à payer</Label>
                          <NumberInput
                            id="tjk-reste-a-payer"
                            value={form.resteAPayer}
                            onChange={(resteAPayer) =>
                              setForm((f) => ({ ...f, resteAPayer }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 6000000"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="tjk-prix-transport">Prix transport</Label>
                          <NumberInput
                            id="tjk-prix-transport"
                            value={form.prixTransport}
                            onChange={(prixTransport) =>
                              setForm((f) => ({ ...f, prixTransport }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 784000"
                          />
                        </div>
                        <div>
                          <Label htmlFor="tjk-total-transport">Total transport</Label>
                          <NumberInput
                            id="tjk-total-transport"
                            value={form.totalTransport}
                            onChange={(totalTransport) =>
                              setForm((f) => ({ ...f, totalTransport }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 11788000"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="tjk-prix-voyage">Prix voyage</Label>
                          <NumberInput
                            id="tjk-prix-voyage"
                            value={form.prixVoyage}
                            onChange={(prixVoyage) =>
                              setForm((f) => ({ ...f, prixVoyage }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 28683600"
                          />
                        </div>
                        <div>
                          <Label htmlFor="tjk-total-paiement">Total paiement</Label>
                          <NumberInput
                            id="tjk-total-paiement"
                            value={form.totalPaiement}
                            onChange={(totalPaiement) =>
                              setForm((f) => ({ ...f, totalPaiement }))
                            }
                            min={0}
                            allowEmpty
                            placeholder="Ex. 10000000"
                          />
                        </div>
                      </div>
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

      {canManageFleet && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Destinations TJK</CardTitle>
              <p className="text-sm text-muted-foreground">
                Montants forfaitaires appliqués automatiquement dans le formulaire d’opération.
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={openCreateDest}>
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle destination
            </Button>
          </CardHeader>
          <CardContent>
            {sortedDestinations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune destination enregistrée. Créez-en une pour préremplir Prix TRANS, transport,
                voyage, etc.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destination</TableHead>
                      <TableHead className="text-right">Qté défaut</TableHead>
                      <TableHead className="text-right">Poids unité (kg)</TableHead>
                      <TableHead className="text-right">Prix TRANS</TableHead>
                      <TableHead className="text-right">Prix transport</TableHead>
                      <TableHead className="text-right">Total transport</TableHead>
                      <TableHead className="text-right">Prix voyage</TableHead>
                      <TableHead className="text-right">Total paiement</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDestinations.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.libelle}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.quantiteDefaut != null
                            ? d.quantiteDefaut.toLocaleString('fr-FR')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(d.poidsUniteKg ?? TJK_DEFAULT_UNIT_WEIGHT_KG).toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.prixTrans != null ? d.prixTrans.toLocaleString('fr-FR') : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.prixTransport != null
                            ? d.prixTransport.toLocaleString('fr-FR')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.totalTransport != null
                            ? d.totalTransport.toLocaleString('fr-FR')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.prixVoyage != null ? d.prixVoyage.toLocaleString('fr-FR') : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.totalPaiement != null
                            ? d.totalPaiement.toLocaleString('fr-FR')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDest(d)}
                              title="Modifier"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => void handleDestDelete(d.id)}
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={destDialogOpen}
        onOpenChange={(open) => {
          setDestDialogOpen(open);
          if (!open) resetDestForm();
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDest ? 'Modifier la destination' : 'Nouvelle destination TJK'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDestSubmit} className="space-y-4">
            <div>
              <Label htmlFor="dest-libelle">Nom de la destination *</Label>
              <Input
                id="dest-libelle"
                value={destForm.libelle}
                onChange={(e) => setDestForm((f) => ({ ...f, libelle: e.target.value }))}
                placeholder="Ex. Bertoua, Yaoundé…"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dest-qte">Quantité par défaut</Label>
                <NumberInput
                  id="dest-qte"
                  value={destForm.quantiteDefaut}
                  onChange={(quantiteDefaut) =>
                    setDestForm((f) => ({ ...f, quantiteDefaut }))
                  }
                  min={0}
                  allowEmpty
                  placeholder="Ex. 540"
                />
              </div>
              <div>
                <Label htmlFor="dest-poids">Poids unité (kg)</Label>
                <NumberInput
                  id="dest-poids"
                  value={destForm.poidsUniteKg}
                  onChange={(poidsUniteKg) =>
                    setDestForm((f) => ({ ...f, poidsUniteKg }))
                  }
                  min={0}
                  allowEmpty
                  placeholder="50"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dest-prix-trans">Prix TRANS</Label>
                <NumberInput
                  id="dest-prix-trans"
                  value={destForm.prixTrans}
                  onChange={(prixTrans) => setDestForm((f) => ({ ...f, prixTrans }))}
                  min={0}
                  allowEmpty
                  placeholder="FCFA"
                />
              </div>
              <div>
                <Label htmlFor="dest-prix-transport">Prix transport</Label>
                <NumberInput
                  id="dest-prix-transport"
                  value={destForm.prixTransport}
                  onChange={(prixTransport) =>
                    setDestForm((f) => ({ ...f, prixTransport }))
                  }
                  min={0}
                  allowEmpty
                  placeholder="FCFA"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dest-total-transport">Total transport</Label>
                <NumberInput
                  id="dest-total-transport"
                  value={destForm.totalTransport}
                  onChange={(totalTransport) =>
                    setDestForm((f) => ({ ...f, totalTransport }))
                  }
                  min={0}
                  allowEmpty
                  placeholder="FCFA"
                />
              </div>
              <div>
                <Label htmlFor="dest-prix-voyage">Prix voyage</Label>
                <NumberInput
                  id="dest-prix-voyage"
                  value={destForm.prixVoyage}
                  onChange={(prixVoyage) => setDestForm((f) => ({ ...f, prixVoyage }))}
                  min={0}
                  allowEmpty
                  placeholder="FCFA"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="dest-total-paiement">Total paiement</Label>
              <NumberInput
                id="dest-total-paiement"
                value={destForm.totalPaiement}
                onChange={(totalPaiement) =>
                  setDestForm((f) => ({ ...f, totalPaiement }))
                }
                min={0}
                allowEmpty
                placeholder="FCFA"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDestDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
                placeholder="Rechercher dans tous les champs…"
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

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-sm mb-4">
            <div className="rounded-md border bg-background p-3">
              <p className="text-muted-foreground text-xs">Nbre Cam</p>
              <p className="font-semibold tabular-nums">{listSummary.nbreCam}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-muted-foreground text-xs">Tonnage total</p>
              <p className="font-semibold tabular-nums">
                {listSummary.tonnageTotal.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <p className="text-muted-foreground text-xs">Prix TRANS total</p>
              <p className="font-semibold tabular-nums">
                {listSummary.prixTransTotal.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 p-3">
              <p className="text-muted-foreground text-xs">Total paiement</p>
              <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {listSummary.totalPaiement.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="rounded-md border bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 p-3">
              <p className="text-muted-foreground text-xs">Reste à payer</p>
              <p className="font-semibold tabular-nums text-orange-700 dark:text-orange-300">
                {listSummary.resteAPayer.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1400px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead>Qualité</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>N° camion</TableHead>
                  <TableHead>ATC</TableHead>
                  <TableHead className="text-right">Qtes</TableHead>
                  <TableHead className="text-right">Tonnage</TableHead>
                  <TableHead>Tel chauf</TableHead>
                  <TableHead className="text-right">Prix TRANS</TableHead>
                  <TableHead className="text-right">Paiement</TableHead>
                  <TableHead>Client</TableHead>
                  {canManageFleet && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManageFleet ? 13 : 12}
                      className="text-center text-muted-foreground py-8"
                    >
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : sorted.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManageFleet ? 13 : 12}
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
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {op.quantite.toLocaleString('fr-FR')}
                        {op.unite ? ` ${op.unite}` : ''}
                      </TableCell>
                      <TableCell>{op.qualite || '—'}</TableCell>
                      <TableCell>{op.destination || '—'}</TableCell>
                      <TableCell>{formatTjkCamionLabel(op)}</TableCell>
                      <TableCell>{op.referenceAtc || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(op.qtes ?? op.quantite).toLocaleString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {op.tonnage != null
                          ? op.tonnage.toLocaleString('fr-FR')
                          : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {op.telChauffeur || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {op.prixTrans != null
                          ? op.prixTrans.toLocaleString('fr-FR')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {op.paiement != null
                          ? op.paiement.toLocaleString('fr-FR')
                          : '—'}
                      </TableCell>
                      <TableCell>{formatTjkClientLabel(op)}</TableCell>
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
