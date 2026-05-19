/** Page bons de chargement fournisseur. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, SupplierLoading } from '@/contexts/AppContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import { PAGE_CHARGEMENTS_DESCRIPTION } from '@/lib/metier-activite';
import {
  formatSupplierLoadingStatusFr,
  SUPPLIER_LOADING_STATUS_OPTIONS,
  type SupplierLoadingStatus,
  isLoadingUnassigned,
} from '@/lib/supplier-loadings';
import { formatClientOrderStatusFr } from '@/lib/client-operations';
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
import { Plus, Edit, Trash2, Search, Link2, Loader2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { frCollator, stableSort } from '@/lib/list-sort';
import type { SupplierLoadingAssignmentPayload } from '@/lib/api';
import {
  computeLineAmount,
  formatArticleSupplierPriceLabel,
  getArticleSupplierUnitPrice,
  listArticlesForSupplier,
} from '@/lib/article-pricing';

const todayIso = () => new Date().toISOString().slice(0, 10);

function statusBadgeVariant(
  statut: SupplierLoadingStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (statut === 'annule') return 'destructive';
  if (statut === 'affecte') return 'default';
  if (statut === 'partiellement_affecte') return 'secondary';
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierLoading | null>(null);
  const [form, setForm] = useState<LoadingFormState>(emptyForm);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState<SupplierLoading | null>(null);
  const [assignRows, setAssignRows] = useState<SupplierLoadingAssignmentPayload[]>([]);
  const [assignSearch, setAssignSearch] = useState('');

  const fournisseurs = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'fournisseur' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const clientsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const tp of thirdParties) {
      if (tp.type === 'client') m.set(tp.id, tp.nom);
    }
    return m;
  }, [thirdParties]);

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
  }, [supplierLoadings, search, filterFournisseur, filterStatut, unassignedOnly]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const articlesForFournisseur = useMemo(
    () => listArticlesForSupplier(articles, form.fournisseurId),
    [articles, form.fournisseurId],
  );

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
      lieu: l.lieu ?? '',
      notes: l.notes ?? '',
      statut: l.statut,
    });
    setDialogOpen(true);
  };

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
        toast.error('Date de chargement requise.');
        return;
      }

      const payload = {
        fournisseurId: form.fournisseurId,
        numeroBon: form.numeroBon.trim() || undefined,
        articleId: form.articleId || undefined,
        designation: form.designation.trim(),
        quantite: form.quantite,
        unite: form.unite.trim() || undefined,
        montantBon: form.montantBon,
        dateChargement: form.dateChargement,
        lieu: form.lieu.trim() || undefined,
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
    setAssignDialogOpen(true);
  };

  const ordersForAssign = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return stableSort(
      clientOrders.filter((o) => o.statut !== 'annulee'),
      (a, b) => frCollator.compare(b.dateCommande, a.dateCommande),
    ).filter((o) => {
      if (!q) return true;
      const clientNom = clientsById.get(o.clientId) ?? '';
      return (
        o.designation.toLowerCase().includes(q) ||
        (o.reference ?? '').toLowerCase().includes(q) ||
        clientNom.toLowerCase().includes(q)
      );
    });
  }, [clientOrders, assignSearch, clientsById]);

  const toggleOrderInAssign = (orderId: string) => {
    setAssignRows((prev) => {
      const exists = prev.find((r) => r.clientOrderId === orderId);
      if (exists) return prev.filter((r) => r.clientOrderId !== orderId);
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
      await setSupplierLoadingAssignments(assignLoading.id, assignRows);
      toast.success('Affectation enregistrée.');
      setAssignDialogOpen(false);
    });


  return (
    <div className="space-y-6">
      <PageHeader
        title="Chargements"
        description={PAGE_CHARGEMENTS_DESCRIPTION}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/fournisseurs">Vue fournisseurs</Link>
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                  <Label>Article (catalogue)</Label>
                  <Select
                    value={form.articleId || '_none'}
                    onValueChange={(v) => onArticleChange(v === '_none' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optionnel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Aucun —</SelectItem>
                      {(form.fournisseurId ? articlesForFournisseur : articles.filter((a) => a.actif)).map(
                        (a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {form.fournisseurId
                              ? formatArticleSupplierPriceLabel(a, form.fournisseurId)
                              : `${a.libelle} (${a.unite})`}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
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
                  <Label>Date chargement *</Label>
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
                  <Label>Lieu / site</Label>
                  <Input
                    value={form.lieu}
                    onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))}
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
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
              <Checkbox
                checked={unassignedOnly}
                onCheckedChange={(c) => setUnassignedOnly(c === true)}
              />
              Non affectés uniquement
            </label>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>N° bon</TableHead>
                  <TableHead>Désignation</TableHead>
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
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Aucun bon de chargement.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedLoadings.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap">{l.dateChargement}</TableCell>
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
                                {a.clientNom ?? 'Client'} — {a.orderDesignation}
                                {a.quantiteAffectee != null ? ` (${a.quantiteAffectee})` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {l.statut !== 'annule' && (
                          <>
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
              <Input
                placeholder="Filtrer commandes (client, réf., désignation)…"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
              />
              <div className="border rounded-md max-h-[320px] overflow-y-auto divide-y">
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
                          {clientsById.get(o.clientId) ?? 'Client'} ·{' '}
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
