/** Page bons de chargement fournisseur. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, SupplierLoading } from '@/contexts/AppContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import {
  formatSupplierLoadingStatusFr,
  SUPPLIER_LOADING_STATUS_OPTIONS,
  type SupplierLoadingStatus,
  getLoadingAssignedClientId,
  isLoadingUnassigned,
  isLoadingAtHub,
} from '@/lib/supplier-loadings';
import {
  HUB_PRESETS,
  LOADING_ENTRY_MODE_OPTIONS,
  computeHubRemainder,
  defaultHubForEntryMode,
  formatLoadingEntryModeFr,
  type LoadingEntryMode,
} from '@/lib/hub-transit';
import {
  formatClientAccountKindFr,
  formatClientDisplayName,
  formatClientOrderStatusFr,
  getClientAccountKey,
  getClientAccountKind,
  type ClientAccountKind,
} from '@/lib/client-operations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { Plus, Edit, Trash2, Search, Link2, Loader2, Ban, Train, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { ExportButtons } from '@/components/ExportButtons';
import { exportToExcelWithDetails, exportToPrintablePDFWithDetails } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import { frCollator, stableSort } from '@/lib/list-sort';
import type { SupplierLoadingAssignmentPayload } from '@/lib/api';
import {
  computeLineAmount,
  formatArticleSupplierPriceLabel,
  getArticleSupplierUnitPrice,
  listArticlesForSupplier,
} from '@/lib/article-pricing';

const todayIso = () => new Date().toISOString().slice(0, 10);
const WALK_IN_CLIENT_KEY = 'comptoir:Client comptoir';

function statusBadgeVariant(
  statut: SupplierLoadingStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (statut === 'annule') return 'destructive';
  if (statut === 'affecte' || statut === 'solde') return 'default';
  if (statut === 'partiellement_affecte' || statut === 'en_dispatch') return 'secondary';
  if (statut === 'au_hub' || statut === 'en_transit') return 'outline';
  return 'outline';
}

type LoadingFormState = {
  fournisseurId: string;
  numeroBon: string;
  articleId: string;
  designation: string;
  quantite: number | undefined;
  prixUnitaireFournisseur: number | undefined;
  montantBon: number | undefined;
  montantBonTouched: boolean;
  unite: string;
  dateChargement: string;
  dateLivraison: string;
  modeEntree: LoadingEntryMode;
  camionId: string;
  hubArrivee: string;
  dateArriveeHub: string;
  lieu: string;
  notes: string;
  statut: SupplierLoadingStatus | '';
};

const emptyForm = (): LoadingFormState => ({
  fournisseurId: '',
  numeroBon: '',
  articleId: '',
  designation: '',
  quantite: undefined,
  prixUnitaireFournisseur: undefined,
  montantBon: undefined,
  montantBonTouched: false,
  unite: '',
  dateChargement: todayIso(),
  dateLivraison: '',
  modeEntree: 'bon_simple',
  camionId: '',
  hubArrivee: '',
  dateArriveeHub: '',
  lieu: '',
  notes: '',
  statut: '',
});

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

export default function Chargements() {
  const {
    supplierLoadings,
    thirdParties,
    trucks,
    articles,
    clientOrders,
    createSupplierLoading,
    updateSupplierLoading,
    deleteSupplierLoading,
    setSupplierLoadingAssignments,
  } = useApp();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [search, setSearch] = useState('');
  const [filterFournisseur, setFilterFournisseur] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [auHubOnly, setAuHubOnly] = useState(false);
  const [filterClientKind, setFilterClientKind] = useState<'all' | ClientAccountKind>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierLoading | null>(null);
  const [form, setForm] = useState<LoadingFormState>(emptyForm);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState<SupplierLoading | null>(null);
  const [assignRows, setAssignRows] = useState<SupplierLoadingAssignmentPayload[]>([]);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignClientId, setAssignClientId] = useState('');

  const fournisseurs = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'fournisseur' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const clients = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'client' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const clientsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const tp of clients) m.set(tp.id, tp.nom);
    return m;
  }, [clients]);

  const getOrderClientName = (order: { clientId?: string; clientNom?: string }) =>
    formatClientDisplayName(order, (id) => clientsById.get(id));

  const getClientKeyLabel = (key: string) =>
    key.startsWith('comptoir:') ? 'Client comptoir' : clientsById.get(key) ?? '—';

  const activeTrucks = useMemo(
    () =>
      stableSort(
        trucks.filter((t) => t.statut === 'actif'),
        (a, b) => frCollator.compare(a.immatriculation, b.immatriculation),
      ),
    [trucks],
  );

  const truckLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trucks) m.set(t.id, `${t.immatriculation} · ${t.modele}`);
    return m;
  }, [trucks]);

  const sortedLoadings = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = stableSort(supplierLoadings, (a, b) => {
      const d = frCollator.compare(b.dateChargement, a.dateChargement);
      if (d !== 0) return d;
      return frCollator.compare(a.designation, b.designation);
    });

    if (filterFournisseur) {
      list = list.filter((l) => l.fournisseurId === filterFournisseur);
    }
    if (filterStatut !== 'all') {
      list = list.filter((l) => l.statut === filterStatut);
    }
    if (unassignedOnly) {
      list = list.filter((l) =>
        isLoadingUnassigned(l.statut, l.assignments?.length ?? 0),
      );
    }
    if (auHubOnly) {
      list = list.filter((l) => isLoadingAtHub(l.statut) || l.modeEntree === 'rail');
    }
    if (filterClientKind !== 'all') {
      list = list.filter((l) =>
        (l.assignments ?? []).some((a) => getClientAccountKind(a) === filterClientKind),
      );
    }
    if (q) {
      list = list.filter((l) => {
        const inMain =
          l.designation.toLowerCase().includes(q) ||
          (l.numeroBon ?? '').toLowerCase().includes(q) ||
          (l.fournisseurNom ?? '').toLowerCase().includes(q) ||
          (l.lieu ?? '').toLowerCase().includes(q);
        const inAssign = (l.assignments ?? []).some(
          (a) =>
            (a.clientNom ?? '').toLowerCase().includes(q) ||
            (a.orderDesignation ?? '').toLowerCase().includes(q) ||
            (a.orderReference ?? '').toLowerCase().includes(q),
        );
        return inMain || inAssign;
      });
    }
    return list;
  }, [supplierLoadings, search, filterFournisseur, filterStatut, unassignedOnly, auHubOnly, filterClientKind]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openCamrailBon = () => {
    setEditing(null);
    const hub = HUB_PRESETS[0];
    setForm({
      ...emptyForm(),
      modeEntree: 'rail',
      hubArrivee: hub,
      lieu: hub,
      statut: 'en_transit',
    });
    setDialogOpen(true);
  };

  const articlesForFournisseur = useMemo(
    () => listArticlesForSupplier(articles, form.fournisseurId),
    [articles, form.fournisseurId],
  );

  const supplierSiteOptions = useMemo(() => {
    if (!form.fournisseurId) return [];
    const sites = new Set<string>();
    const fournisseur = thirdParties.find((tp) => tp.id === form.fournisseurId);
    if (fournisseur?.adresse?.trim()) sites.add(fournisseur.adresse.trim());
    supplierLoadings
      .filter((l) => l.fournisseurId === form.fournisseurId)
      .forEach((l) => {
        if (l.lieu?.trim()) sites.add(l.lieu.trim());
      });
    return stableSort([...sites], (a, b) => frCollator.compare(a, b));
  }, [form.fournisseurId, supplierLoadings, thirdParties]);

  const syncBonValue = (
    base: LoadingFormState,
    patch: Partial<LoadingFormState>,
  ): LoadingFormState => {
    const next = { ...base, ...patch };
    const art = next.articleId
      ? articles.find((a) => a.id === next.articleId)
      : undefined;
    const pu =
      next.prixUnitaireFournisseur ??
      (next.fournisseurId ? getArticleSupplierUnitPrice(art, next.fournisseurId) : undefined);
    const montantCalc = computeLineAmount(next.quantite, pu);
    return {
      ...next,
      prixUnitaireFournisseur: pu,
      montantBon: next.montantBonTouched ? next.montantBon : montantCalc ?? next.montantBon,
    };
  };

  const openEdit = (l: SupplierLoading) => {
    setEditing(l);
    const art = l.articleId ? articles.find((a) => a.id === l.articleId) : undefined;
    const pu = getArticleSupplierUnitPrice(art, l.fournisseurId);
    setForm({
      fournisseurId: l.fournisseurId,
      numeroBon: l.numeroBon ?? '',
      articleId: l.articleId ?? '',
      designation: l.designation,
      quantite: l.quantite,
      prixUnitaireFournisseur: pu,
      montantBon: l.montantBon,
      montantBonTouched: l.montantBon != null,
      unite: l.unite ?? '',
      dateChargement: l.dateChargement,
      dateLivraison: l.dateLivraison ?? '',
      modeEntree: l.modeEntree ?? 'camion',
      camionId: l.camionId ?? '',
      hubArrivee: l.hubArrivee ?? '',
      dateArriveeHub: l.dateArriveeHub ?? '',
      lieu: l.lieu ?? '',
      notes: l.notes ?? '',
      statut: l.statut,
    });
    setDialogOpen(true);
  };

  const handleMarkArrivedHub = (l: SupplierLoading) =>
    withGuard(async () => {
      await updateSupplierLoading(l.id, {
        statut: 'au_hub',
        dateArriveeHub: todayIso(),
        hubArrivee: l.hubArrivee || HUB_PRESETS[0],
      });
      toast.success('Bon marqué comme arrivé au hub.');
    });

  const onArticleChange = (articleId: string) => {
    const art = articles.find((a) => a.id === articleId);
    setForm((f) =>
      syncBonValue(f, {
        articleId,
        designation: art ? art.libelle : f.designation,
        unite: art ? art.unite : f.unite,
        montantBonTouched: false,
      }),
    );
  };

  const handleSave = () =>
    withGuard(async () => {
      if (!form.fournisseurId) {
        toast.error('Choisissez un fournisseur.');
        return;
      }
      if (!form.designation.trim()) {
        toast.error('Désignation requise.');
        return;
      }
      if (!form.dateChargement) {
        toast.error("Date d'émission du bon requise.");
        return;
      }
      if (form.modeEntree === 'camion_ansar' && !form.camionId) {
        toast.error('Choisissez le camion SIA-ANSAR utilisé pour ce bon.');
        return;
      }

      const isCamrail = form.modeEntree === 'rail';
      const isCamionAnsar = form.modeEntree === 'camion_ansar' || form.modeEntree === 'camion';
      const hub = isCamrail ? form.hubArrivee.trim() || undefined : undefined;
      const payload = {
        fournisseurId: form.fournisseurId,
        numeroBon: form.numeroBon.trim() || undefined,
        articleId: form.articleId || undefined,
        designation: form.designation.trim(),
        quantite: form.quantite,
        unite: form.unite.trim() || undefined,
        montantBon: form.montantBon,
        dateChargement: form.dateChargement,
        dateLivraison: form.dateLivraison || undefined,
        modeEntree: form.modeEntree,
        camionId: isCamionAnsar ? form.camionId || undefined : undefined,
        hubArrivee: hub,
        dateArriveeHub: isCamrail ? form.dateArriveeHub.trim() || undefined : undefined,
        lieu: form.lieu.trim() || hub || undefined,
        notes: form.notes.trim() || undefined,
        ...(form.statut ? { statut: form.statut } : {}),
      };

      if (editing) {
        await updateSupplierLoading(editing.id, payload);
        toast.success('Bon mis à jour.');
      } else {
        await createSupplierLoading({
          ...payload,
          statut: form.statut === 'brouillon' ? 'brouillon' : undefined,
        });
        toast.success('Bon de chargement créé.');
      }
      setDialogOpen(false);
    });

  const handleAnnuler = (l: SupplierLoading) =>
    withGuard(async () => {
      if (!window.confirm(`Annuler le bon « ${l.designation} » ?`)) return;
      await updateSupplierLoading(l.id, { statut: 'annule' });
      toast.success('Bon annulé.');
    });

  const handleDelete = (l: SupplierLoading) =>
    withGuard(async () => {
      if (!window.confirm('Supprimer définitivement ce bon ?')) return;
      await deleteSupplierLoading(l.id);
      toast.success('Bon supprimé.');
    });

  const openAssign = (l: SupplierLoading) => {
    setAssignLoading(l);
    setAssignRows(
      (l.assignments ?? []).map((a) => ({
        clientOrderId: a.clientOrderId,
        quantiteAffectee: a.quantiteAffectee,
        notes: a.notes,
      })),
    );
    setAssignSearch('');
    setAssignClientId(getLoadingAssignedClientId(l) ?? '');
    setAssignDialogOpen(true);
  };

  const assignClientLocked = Boolean(
    assignLoading && getLoadingAssignedClientId(assignLoading),
  );

  const ordersForAssign = useMemo(() => {
    if (!assignClientId) return [];
    const q = assignSearch.trim().toLowerCase();
    return stableSort(
      clientOrders.filter((o) => {
        if (o.statut === 'annulee') return false;
        if (getClientAccountKey(o) !== assignClientId) return false;
        return true;
      }),
      (a, b) => frCollator.compare(b.dateCommande, a.dateCommande),
    ).filter((o) => {
      if (!q) return true;
      const clientNom = getOrderClientName(o);
      return (
        o.designation.toLowerCase().includes(q) ||
        (o.reference ?? '').toLowerCase().includes(q) ||
        clientNom.toLowerCase().includes(q)
      );
    });
  }, [clientOrders, assignSearch, assignClientId, clientsById]);

  const toggleOrderInAssign = (orderId: string) => {
    const order = clientOrders.find((o) => o.id === orderId);
    if (!order) return;
    if (assignClientId && getClientAccountKey(order) !== assignClientId) {
      toast.error('Ce bon ne peut être affecté qu’à un seul client.');
      return;
    }
    setAssignRows((prev) => {
      const exists = prev.find((r) => r.clientOrderId === orderId);
      if (exists) return prev.filter((r) => r.clientOrderId !== orderId);
      if (!assignClientId) setAssignClientId(getClientAccountKey(order));
      return [...prev, { clientOrderId: orderId }];
    });
  };

  const setAssignQty = (orderId: string, qty: number | undefined) => {
    setAssignRows((prev) =>
      prev.map((r) =>
        r.clientOrderId === orderId ? { ...r, quantiteAffectee: qty } : r,
      ),
    );
  };

  const saveAssignments = () =>
    withGuard(async () => {
      if (!assignLoading) return;
      const clientKeys = new Set(
        assignRows
          .map((r) => {
            const order = clientOrders.find((o) => o.id === r.clientOrderId);
            return order ? getClientAccountKey(order) : '';
          })
          .filter(Boolean),
      );
      if (clientKeys.size > 1) {
        toast.error('Un bon ne peut être affecté qu’à un seul client.');
        return;
      }
      await setSupplierLoadingAssignments(assignLoading.id, assignRows);
      toast.success('Affectation enregistrée.');
      setAssignDialogOpen(false);
    });

  const getFiltersDescription = () => {
    const parts: string[] = [];
    if (search.trim()) parts.push(`Recherche: "${search.trim()}"`);
    if (filterFournisseur) {
      const f = fournisseurs.find((x) => x.id === filterFournisseur);
      if (f) parts.push(`Fournisseur: ${f.nom}`);
    }
    if (filterStatut !== 'all') parts.push(`Statut: ${formatSupplierLoadingStatusFr(filterStatut as SupplierLoadingStatus)}`);
    if (filterClientKind !== 'all') parts.push(formatClientAccountKindFr(filterClientKind));
    if (unassignedOnly) parts.push('Non affectés uniquement');
    return parts.length > 0 ? parts.join(' · ') : undefined;
  };

  const loadingExportColumns = [
    { header: 'Date émission bon', value: (l: SupplierLoading) => l.dateChargement },
    { header: 'Date livraison', value: (l: SupplierLoading) => l.dateLivraison || '—' },
    { header: 'Fournisseur', value: (l: SupplierLoading) => l.fournisseurNom ?? '—' },
    { header: 'N° bon', value: (l: SupplierLoading) => l.numeroBon || '—' },
    { header: 'Désignation', value: (l: SupplierLoading) => l.designation },
    { header: 'Mode d’entrée', value: (l: SupplierLoading) => formatLoadingEntryModeFr(l.modeEntree) },
    { header: 'Camion SIA-ANSAR', value: (l: SupplierLoading) => l.camionId ? truckLabelById.get(l.camionId) ?? '—' : '—' },
    {
      header: 'Quantité',
      value: (l: SupplierLoading) =>
        l.quantite != null ? `${l.quantite}${l.unite ? ` ${l.unite}` : ''}` : '—',
    },
    {
      header: 'Valeur bon (FCFA)',
      value: (l: SupplierLoading) => (l.montantBon != null ? Math.round(l.montantBon) : '—'),
    },
    { header: 'Statut', value: (l: SupplierLoading) => formatSupplierLoadingStatusFr(l.statut) },
    {
      header: 'Nature client',
      value: (l: SupplierLoading) => {
        const kinds = [...new Set((l.assignments ?? []).map((a) => formatClientAccountKindFr(getClientAccountKind(a))))];
        return kinds.length ? kinds.join(' / ') : '—';
      },
    },
    { header: 'Lieu', value: (l: SupplierLoading) => l.lieu || '—' },
  ];

  const buildLoadingDetailBlocks = (l: SupplierLoading) => {
    const assigns = l.assignments ?? [];
    return [
      {
        title: `Affectations (${assigns.length})`,
        columns: ['Client', 'Nature client', 'Commande', 'Réf. commande', 'Qté affectée', 'Notes'],
        rows:
          assigns.length > 0
            ? assigns.map((a) => [
                a.clientNom ?? '—',
                formatClientAccountKindFr(getClientAccountKind(a)),
                a.orderDesignation ?? '—',
                a.orderReference ?? '—',
                a.quantiteAffectee != null ? a.quantiteAffectee : '—',
                a.notes ?? '—',
              ])
            : [['—', '—', 'Aucune commande liée', '', '', '']],
      },
    ];
  };

  const handleExportExcel = () => {
    exportToExcelWithDetails({
      title: 'Bons de chargement',
      fileName: `chargements_${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName: 'Chargements',
      filtersDescription: getFiltersDescription(),
      columns: loadingExportColumns,
      rows: sortedLoadings,
      buildDetailBlocks: buildLoadingDetailBlocks,
      getDetailHeading: (l) =>
        `${l.numeroBon?.trim() || l.designation} — ${l.fournisseurNom ?? 'Fournisseur'}`,
    });
    toast.success('Export Excel généré');
  };

  const handleExportPDF = () => {
    const nonAffectes = sortedLoadings.filter(
      (l) => !l.assignments?.length,
    ).length;
    exportToPrintablePDFWithDetails({
      title: 'Bons de chargement',
      fileName: `chargements_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: getFiltersDescription(),
      headerColor: '#65a30d',
      headerTextColor: '#ffffff',
      evenRowColor: '#f7fee7',
      oddRowColor: '#ffffff',
      accentColor: '#65a30d',
      totals: [
        { label: 'Bons listés', value: sortedLoadings.length, style: 'neutral', icon: EMOJI.liste },
        { label: 'Sans affectation', value: nonAffectes, style: 'neutral', icon: '📦' },
      ],
      columns: loadingExportColumns,
      rows: sortedLoadings,
      buildDetailBlocks: buildLoadingDetailBlocks,
      getDetailHeading: (l) =>
        `${l.numeroBon?.trim() || l.designation} — ${l.fournisseurNom ?? ''}`,
    });
    toast.success('Export PDF — enregistrez via la fenêtre d’impression');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chargements"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons onExcel={handleExportExcel} onPdf={handleExportPDF} size="sm" />
            <Button variant="outline" size="sm" asChild>
              <Link to="/fournisseurs">Vue fournisseurs</Link>
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button type="button" variant="secondary" size="sm" onClick={openCamrailBon}>
              <Train className="h-4 w-4 mr-2" />
              Bon CAMRAIL (rail)
            </Button>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau bon
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editing ? 'Modifier le bon' : 'Nouveau bon de chargement'}
                </DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSave();
                }}
              >
                <div className="space-y-2">
                  <Label>Fournisseur *</Label>
                  <ThirdPartyPicker
                    options={fournisseurs}
                    value={form.fournisseurId}
                    onValueChange={(id) =>
                      setForm((f) =>
                        syncBonValue(
                          { ...f, fournisseurId: id, articleId: '', montantBonTouched: false },
                          {},
                        ),
                      )
                    }
                    placeholder="Choisir un fournisseur…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>N° bon</Label>
                  <Input
                    value={form.numeroBon}
                    onChange={(e) => setForm((f) => ({ ...f, numeroBon: e.target.value }))}
                    placeholder="Référence fournisseur"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Désignation fournisseur</Label>
                  <Select
                    value={form.articleId || '_none'}
                    onValueChange={(v) => onArticleChange(v === '_none' ? '' : v)}
                    disabled={!form.fournisseurId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.fournisseurId ? 'Choisir une désignation…' : 'Choisir d’abord un fournisseur'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Saisie libre —</SelectItem>
                      {articlesForFournisseur.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">
                          Aucune désignation tarifée pour ce fournisseur.
                        </div>
                      ) : (
                        articlesForFournisseur.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {formatArticleSupplierPriceLabel(a, form.fournisseurId)}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    La sélection remplit automatiquement désignation, unité, prix fournisseur et valeur du bon.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Désignation *</Label>
                  <Input
                    value={form.designation}
                    onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Quantité</Label>
                    <NumberInput
                      allowEmpty
                      value={form.quantite}
                      onChange={(v) =>
                        setForm((f) => syncBonValue(f, { quantite: v, montantBonTouched: false }))
                      }
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unité</Label>
                    <Input
                      value={form.unite}
                      onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Prix unitaire fournisseur (FCFA)</Label>
                    <NumberInput
                      allowEmpty
                      value={form.prixUnitaireFournisseur}
                      onChange={(v) =>
                        setForm((f) =>
                          syncBonValue(f, {
                            prixUnitaireFournisseur: v,
                            montantBonTouched: false,
                          }),
                        )
                      }
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valeur du bon (FCFA)</Label>
                    <NumberInput
                      allowEmpty
                      value={form.montantBon}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, montantBon: v, montantBonTouched: true }))
                      }
                      min={0}
                    />
                  </div>
                </div>
                {form.quantite != null &&
                  form.prixUnitaireFournisseur != null &&
                  form.quantite > 0 &&
                  form.prixUnitaireFournisseur > 0 && (
                    <p className="text-xs text-muted-foreground -mt-2">
                      Calcul auto : {form.quantite} ×{' '}
                      {form.prixUnitaireFournisseur.toLocaleString('fr-FR')} ={' '}
                      {formatFcfa(form.quantite * form.prixUnitaireFournisseur)}
                    </p>
                  )}
                <div className="space-y-2">
                  <Label>Mode d&apos;entrée</Label>
                  <Select
                    value={form.modeEntree}
                    onValueChange={(v) => {
                      const mode = v as LoadingEntryMode;
                      const hub = defaultHubForEntryMode(mode);
                      setForm((f) => ({
                        ...f,
                        modeEntree: mode,
                        camionId:
                          mode === 'camion_ansar' || mode === 'camion' ? f.camionId : '',
                        hubArrivee: mode === 'rail' ? f.hubArrivee.trim() || hub : '',
                        dateArriveeHub: mode === 'rail' ? f.dateArriveeHub : '',
                        lieu: mode === 'rail' ? f.hubArrivee.trim() || hub : f.lieu,
                        statut:
                          !editing && mode === 'rail'
                            ? f.dateArriveeHub
                              ? 'au_hub'
                              : 'en_transit'
                            : f.statut,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOADING_ENTRY_MODE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(form.modeEntree === 'camion_ansar' || form.modeEntree === 'camion') && (
                  <div className="space-y-2 rounded-md border border-dashed p-3 bg-muted/30">
                    <Label>Camion direct SIA-ANSAR *</Label>
                    <Select
                      value={form.camionId || ''}
                      onValueChange={(camionId) => setForm((f) => ({ ...f, camionId }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un camion disponible" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeTrucks.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground">
                            Aucun camion actif disponible.
                          </div>
                        ) : (
                          activeTrucks.map((truck) => (
                            <SelectItem key={truck.id} value={truck.id}>
                              {truck.immatriculation} · {truck.modele}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      À utiliser quand SIA-ANSAR enlève directement la marchandise chez le fournisseur.
                    </p>
                  </div>
                )}
                {form.modeEntree === 'rail' && (
                  <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/30">
                    <div className="space-y-2">
                      <Label>Hub d&apos;arrivée (CAMRAIL)</Label>
                      <Select
                        value={
                          (HUB_PRESETS as readonly string[]).includes(form.hubArrivee)
                            ? form.hubArrivee
                            : 'Autre hub'
                        }
                        onValueChange={(v) => {
                          if (v !== 'Autre hub') {
                            setForm((f) => ({ ...f, hubArrivee: v, lieu: v }));
                          } else {
                            setForm((f) => ({ ...f, hubArrivee: '', lieu: '' }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir le hub" />
                        </SelectTrigger>
                        <SelectContent>
                          {HUB_PRESETS.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!(HUB_PRESETS as readonly string[]).slice(0, -1).includes(form.hubArrivee) && (
                        <Input
                          placeholder="Nom du hub"
                          value={form.hubArrivee}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              hubArrivee: e.target.value,
                              lieu: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Date arrivée au hub</Label>
                      <Input
                        type="date"
                        value={form.dateArriveeHub}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            dateArriveeHub: e.target.value,
                            statut: e.target.value ? 'au_hub' : f.statut || 'en_transit',
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date d&apos;émission du bon *</Label>
                    <Input
                      type="date"
                      value={form.dateChargement}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dateChargement: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date de livraison</Label>
                    <Input
                      type="date"
                      value={form.dateLivraison}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dateLivraison: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Lieu / site</Label>
                  {supplierSiteOptions.length > 0 && (
                    <Select
                      value={supplierSiteOptions.includes(form.lieu) ? form.lieu : '_manual'}
                      onValueChange={(lieu) =>
                        setForm((f) => ({
                          ...f,
                          lieu: lieu === '_manual' ? '' : lieu,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un lieu prédéfini" />
                      </SelectTrigger>
                      <SelectContent>
                        {supplierSiteOptions.map((site) => (
                          <SelectItem key={site} value={site}>
                            {site}
                          </SelectItem>
                        ))}
                        <SelectItem value="_manual">Saisie libre</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    value={form.lieu}
                    onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))}
                    placeholder={
                      supplierSiteOptions.length > 0
                        ? 'Ou saisir un autre lieu'
                        : 'Lieu / site du fournisseur'
                    }
                  />
                </div>
                {editing && (
                  <div className="space-y-2">
                    <Label>Statut</Label>
                    <Select
                      value={form.statut || editing.statut}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, statut: v as SupplierLoadingStatus }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPLIER_LOADING_STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {formatSupplierLoadingStatusFr(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
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
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher bon, fournisseur, commande…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-[200px] space-y-1">
              <Label className="text-xs text-muted-foreground">Fournisseur</Label>
              <ThirdPartyPicker
                options={fournisseurs}
                value={filterFournisseur}
                onValueChange={setFilterFournisseur}
                placeholder="Tous"
                topChoices={[{ id: '', label: 'Tous les fournisseurs' }]}
              />
            </div>
            <div className="w-[200px] space-y-1">
              <Label className="text-xs text-muted-foreground">Statut</Label>
              <Select value={filterStatut} onValueChange={setFilterStatut}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {SUPPLIER_LOADING_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatSupplierLoadingStatusFr(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[200px] space-y-1">
              <Label className="text-xs text-muted-foreground">Nature client</Label>
              <Select
                value={filterClientKind}
                onValueChange={(v) => setFilterClientKind(v as 'all' | ClientAccountKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clients</SelectItem>
                  <SelectItem value="registered">Clients enregistrés</SelectItem>
                  <SelectItem value="walk_in">Clients comptoir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <Checkbox
                checked={unassignedOnly}
                onCheckedChange={(c) => setUnassignedOnly(c === true)}
              />
              Non affectés uniquement
            </label>
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <Checkbox
                checked={auHubOnly}
                onCheckedChange={(c) => setAuHubOnly(c === true)}
              />
              Au hub / CAMRAIL
            </label>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Émission</TableHead>
                  <TableHead>Livraison</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>N° bon</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Hub / entrée</TableHead>
                  <TableHead>Qté</TableHead>
                  <TableHead>Valeur bon</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Commandes liées</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLoadings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      Aucun bon de chargement.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedLoadings.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{l.dateChargement}</TableCell>
                      <TableCell className="whitespace-nowrap">{l.dateLivraison || '—'}</TableCell>
                      <TableCell>
                        <Link
                          to={`/tiers?id=${l.fournisseurId}`}
                          className="text-primary hover:underline"
                        >
                          {l.fournisseurNom ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell>{l.numeroBon || '—'}</TableCell>
                      <TableCell className="font-medium">{l.designation}</TableCell>
                      <TableCell className="text-xs max-w-[140px]">
                        <span className="block">{formatLoadingEntryModeFr(l.modeEntree)}</span>
                        {l.camionId ? (
                          <span className="text-muted-foreground block mt-0.5">
                            {truckLabelById.get(l.camionId) ?? 'Camion SIA-ANSAR'}
                          </span>
                        ) : null}
                        {l.hubArrivee ? (
                          <span className="text-muted-foreground flex items-center gap-0.5 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {l.hubArrivee}
                          </span>
                        ) : null}
                        {computeHubRemainder(l.quantite, l.assignments) != null ? (
                          <span className="text-amber-700 dark:text-amber-400 block mt-0.5">
                            Reste hub : {computeHubRemainder(l.quantite, l.assignments)}
                            {l.unite ? ` ${l.unite}` : ''}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l.quantite != null
                          ? `${l.quantite}${l.unite ? ` ${l.unite}` : ''}`
                          : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l.montantBon != null ? formatFcfa(l.montantBon) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(l.statut)}>
                          {formatSupplierLoadingStatusFr(l.statut)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {(l.assignments ?? []).length === 0 ? (
                          <span className="text-muted-foreground text-sm">—</span>
                        ) : (
                          <ul className="text-sm space-y-0.5">
                            {(l.assignments ?? []).map((a) => (
                              <li key={a.id}>
                                <span>{a.clientNom ?? 'Client'} — {a.orderDesignation}</span>
                                <Badge variant="outline" className="ml-1 text-[10px]">
                                  {formatClientAccountKindFr(getClientAccountKind(a))}
                                </Badge>
                                {a.quantiteAffectee != null ? ` (${a.quantiteAffectee})` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {l.statut !== 'annule' && (
                          <>
                            {l.statut === 'en_transit' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleMarkArrivedHub(l)}
                                title="Marquer arrivé au hub"
                              >
                                <MapPin className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAssign(l)}
                              title="Affecter aux commandes"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openEdit(l)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleAnnuler(l)}
                              title="Annuler"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDelete(l)}
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Affecter le bon — {assignLoading?.designation}</DialogTitle>
          </DialogHeader>
          {assignLoading && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Fournisseur : {assignLoading.fournisseurNom}
                {assignLoading.quantite != null && (
                  <>
                    {' '}
                    · Quantité bon : {assignLoading.quantite} {assignLoading.unite ?? ''}
                  </>
                )}
              </p>
              <div className="space-y-2">
                <Label>Client</Label>
                <ThirdPartyPicker
                  options={clients}
                  value={assignClientId}
                  onValueChange={setAssignClientId}
                  placeholder="Choisir un client…"
                  searchPlaceholder="Rechercher un client…"
                  topChoices={[
                    {
                      id: WALK_IN_CLIENT_KEY,
                      label: 'Client comptoir',
                      keywords: 'passager sans fiche comptoir',
                    },
                  ]}
                  orphanLabel={
                    assignClientId.startsWith('comptoir:') ? 'Client comptoir' : undefined
                  }
                  disabled={assignClientLocked}
                />
                <p className="text-xs text-muted-foreground">
                  {assignClientLocked
                    ? `Bon réservé au client : ${getClientKeyLabel(assignClientId)}`
                    : assignClientId
                      ? `${ordersForAssign.length} commande(s) — ${getClientKeyLabel(assignClientId)}`
                      : 'Choisissez un client pour afficher ses commandes.'}
                </p>
              </div>
              <Input
                placeholder="Filtrer par réf., désignation…"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
              />
              <div className="border rounded-md max-h-[320px] overflow-y-auto divide-y">
                {ordersForAssign.length === 0 ? (
                  <p className="p-4 text-sm text-center text-muted-foreground">
                    {!assignClientId
                      ? 'Sélectionnez un client pour voir ses commandes.'
                      : 'Aucune commande active pour ce client.'}
                  </p>
                ) : null}
                {ordersForAssign.map((o) => {
                  const selected = assignRows.some((r) => r.clientOrderId === o.id);
                  const row = assignRows.find((r) => r.clientOrderId === o.id);
                  return (
                    <div
                      key={o.id}
                      className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleOrderInAssign(o.id)}
                      />
                      <div className="flex-1 min-w-[180px]">
                        <p className="font-medium text-sm">{o.designation}</p>
                        <p className="text-xs text-muted-foreground">
                          {getOrderClientName(o)} ·{' '}
                          {formatClientAccountKindFr(getClientAccountKind(o))} ·{' '}
                          {formatClientOrderStatusFr(o.statut)} · {o.dateCommande}
                          {o.reference ? ` · ${o.reference}` : ''}
                        </p>
                      </div>
                      {selected && assignLoading.quantite != null && (
                        <div className="w-28 space-y-1">
                          <Label className="text-xs">Qté affectée</Label>
                          <NumberInput
                            allowEmpty
                            value={row?.quantiteAffectee}
                            onChange={(v) => setAssignQty(o.id, v)}
                            min={0}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                  Fermer
                </Button>
                <Button disabled={isSubmitting} onClick={() => void saveAssignments()}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enregistrer l’affectation
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
