import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, ClientDelivery, SupplierLoading } from '@/contexts/AppContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import {
  formatSupplierLoadingStatusFr,
  type SupplierLoadingStatus,
} from '@/lib/supplier-loadings';
import {
  formatClientDeliveryStatusFr,
  formatClientOrderStatusFr,
  type ClientDeliveryStatus,
} from '@/lib/client-operations';
import {
  DELIVERY_EXIT_MODE_OPTIONS,
  deliveryLieuForExitMode,
  formatDeliveryExitModeFr,
  type ClientDeliveryExitMode,
} from '@/lib/hub-transit';
import {
  listDeliveriesAvailableToAssign,
  listDeliveriesForTruck,
  listLoadingsAvailableToLink,
  listLoadingsForTruck,
  listOrdersLinkedToTruck,
  summarizeLoadingAssignments,
} from '@/lib/truck-operations';
import {
  computeLineAmount,
  formatArticleSupplierPriceLabel,
  getArticleSupplierUnitPrice,
  listArticlesForSupplier,
} from '@/lib/article-pricing';
import { ClipboardList, Link2, Loader2, Plus, Truck, Unlink } from 'lucide-react';
import { toast } from 'sonner';

const todayIso = () => new Date().toISOString().slice(0, 10);

type Props = {
  truckId: string;
  defaultChauffeurId?: string;
};

export function TruckOperationsPanels({ truckId, defaultChauffeurId }: Props) {
  const {
    thirdParties,
    articles,
    trucks,
    drivers,
    supplierLoadings,
    clientDeliveries,
    clientOrders,
    createSupplierLoading,
    updateSupplierLoading,
    createClientDelivery,
    updateClientDelivery,
    refreshSupplierLoadings,
    refreshClientDeliveries,
    refreshClientOrders,
  } = useApp();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const truck = trucks.find((t) => t.id === truckId);
  const suppliers = useMemo(
    () => thirdParties.filter((t) => t.type === 'fournisseur'),
    [thirdParties],
  );

  const loadings = useMemo(
    () => listLoadingsForTruck(supplierLoadings, truckId),
    [supplierLoadings, truckId],
  );
  const deliveries = useMemo(
    () => listDeliveriesForTruck(clientDeliveries, truckId),
    [clientDeliveries, truckId],
  );
  const linkedOrders = useMemo(
    () => listOrdersLinkedToTruck(clientOrders, supplierLoadings, clientDeliveries, truckId),
    [clientOrders, supplierLoadings, clientDeliveries, truckId],
  );
  const linkableLoadings = useMemo(
    () =>
      listLoadingsAvailableToLink(supplierLoadings, truckId).filter((l) => l.camionId !== truckId),
    [supplierLoadings, truckId],
  );
  const assignableDeliveries = useMemo(
    () =>
      listDeliveriesAvailableToAssign(clientDeliveries, truckId).filter(
        (d) => d.tracteurId !== truckId,
      ),
    [clientDeliveries, truckId],
  );

  const [createLoadingOpen, setCreateLoadingOpen] = useState(false);
  const [linkLoadingOpen, setLinkLoadingOpen] = useState(false);
  const [linkLoadingId, setLinkLoadingId] = useState('');
  const [assignDeliveryOpen, setAssignDeliveryOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'existing' | 'new'>('existing');
  const [assignDeliveryId, setAssignDeliveryId] = useState('');

  const [loadingForm, setLoadingForm] = useState({
    fournisseurId: '',
    numeroBon: '',
    articleId: '',
    designation: '',
    quantite: undefined as number | undefined,
    prixUnitaire: undefined as number | undefined,
    montantBon: undefined as number | undefined,
    unite: 'sac',
    dateChargement: todayIso(),
    dateLivraison: '',
    lieu: '',
    notes: '',
  });

  const [newDeliveryForm, setNewDeliveryForm] = useState({
    clientOrderId: '',
    modeSortie: 'livraison_directe' as ClientDeliveryExitMode,
    lieuLivraison: '',
    statut: 'planifiee' as ClientDeliveryStatus,
    dateLivraison: '',
    chauffeurId: defaultChauffeurId ?? '',
    montantTransport: undefined as number | undefined,
    notes: '',
  });

  const supplierArticles = useMemo(
    () => listArticlesForSupplier(articles, loadingForm.fournisseurId),
    [articles, loadingForm.fournisseurId],
  );

  const activeOrders = useMemo(
    () => clientOrders.filter((o) => o.statut !== 'annulee' && o.statut !== 'livree'),
    [clientOrders],
  );

  const resetLoadingForm = () => {
    setLoadingForm({
      fournisseurId: '',
      numeroBon: '',
      articleId: '',
      designation: '',
      quantite: undefined,
      prixUnitaire: undefined,
      montantBon: undefined,
      unite: 'sac',
      dateChargement: todayIso(),
      dateLivraison: '',
      lieu: '',
      notes: '',
    });
  };

  const openCreateLoading = () => {
    resetLoadingForm();
    setCreateLoadingOpen(true);
  };

  const submitCreateLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadingForm.fournisseurId) {
      toast.error('Choisissez un fournisseur.');
      return;
    }
    if (!loadingForm.designation.trim()) {
      toast.error('Désignation obligatoire.');
      return;
    }
    await withGuard(async () => {
      try {
        await createSupplierLoading({
          fournisseurId: loadingForm.fournisseurId,
          numeroBon: loadingForm.numeroBon.trim() || undefined,
          articleId: loadingForm.articleId || undefined,
          designation: loadingForm.designation.trim(),
          quantite: loadingForm.quantite,
          unite: loadingForm.unite.trim() || undefined,
          montantBon: loadingForm.montantBon,
          dateChargement: loadingForm.dateChargement,
          dateLivraison: loadingForm.dateLivraison || undefined,
          statut: 'en_attente_affectation',
          modeEntree: 'camion_ansar',
          camionId: truckId,
          lieu: loadingForm.lieu.trim() || undefined,
          notes: loadingForm.notes.trim() || undefined,
        });
        toast.success('Bon créé et rattaché à ce camion.');
        setCreateLoadingOpen(false);
        resetLoadingForm();
        await refreshSupplierLoadings();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur création bon');
      }
    });
  };

  const submitLinkLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkLoadingId) {
      toast.error('Choisissez un bon.');
      return;
    }
    await withGuard(async () => {
      try {
        await updateSupplierLoading(linkLoadingId, {
          camionId: truckId,
          modeEntree: 'camion_ansar',
        });
        toast.success('Bon rattaché au camion.');
        setLinkLoadingOpen(false);
        setLinkLoadingId('');
        await refreshSupplierLoadings();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur rattachement');
      }
    });
  };

  const detachLoading = async (loading: SupplierLoading) => {
    if (!confirm(`Détacher le bon « ${loading.numeroBon || loading.designation} » de ce camion ?`)) {
      return;
    }
    await withGuard(async () => {
      try {
        await updateSupplierLoading(loading.id, {
          camionId: null,
          modeEntree: 'bon_simple',
        });
        toast.success('Bon détaché.');
        await refreshSupplierLoadings();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  };

  const openAssignDelivery = () => {
    setAssignMode(assignableDeliveries.length > 0 ? 'existing' : 'new');
    setAssignDeliveryId(assignableDeliveries[0]?.id ?? '');
    setNewDeliveryForm({
      clientOrderId: activeOrders[0]?.id ?? '',
      modeSortie: 'livraison_directe',
      lieuLivraison: activeOrders[0]?.destination ?? '',
      statut: 'planifiee',
      dateLivraison: '',
      chauffeurId: defaultChauffeurId || truck?.chauffeurId || '',
      montantTransport: undefined,
      notes: '',
    });
    setAssignDeliveryOpen(true);
  };

  const submitAssignDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    await withGuard(async () => {
      try {
        if (assignMode === 'existing') {
          if (!assignDeliveryId) {
            toast.error('Choisissez une livraison.');
            return;
          }
          await updateClientDelivery(assignDeliveryId, {
            tracteurId: truckId,
            chauffeurId:
              defaultChauffeurId || truck?.chauffeurId || undefined,
          });
          toast.success('Livraison assignée à ce camion.');
        } else {
          if (!newDeliveryForm.clientOrderId) {
            toast.error('Choisissez une commande.');
            return;
          }
          if (!newDeliveryForm.lieuLivraison.trim()) {
            toast.error('Lieu de livraison obligatoire.');
            return;
          }
          await createClientDelivery({
            clientOrderId: newDeliveryForm.clientOrderId,
            modeSortie: newDeliveryForm.modeSortie,
            lieuLivraison: newDeliveryForm.lieuLivraison.trim(),
            statut: newDeliveryForm.statut,
            dateLivraison: newDeliveryForm.dateLivraison || undefined,
            chauffeurId: newDeliveryForm.chauffeurId || undefined,
            tracteurId: truckId,
            montantTransport: newDeliveryForm.montantTransport,
            notes: newDeliveryForm.notes.trim() || undefined,
          });
          toast.success('Livraison planifiée pour ce camion.');
        }
        setAssignDeliveryOpen(false);
        await Promise.all([refreshClientDeliveries(), refreshClientOrders()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur livraison');
      }
    });
  };

  const detachDelivery = async (d: ClientDelivery) => {
    if (!confirm(`Retirer ce camion de la livraison « ${d.lieuLivraison} » ?`)) return;
    await withGuard(async () => {
      try {
        await updateClientDelivery(d.id, { tracteurId: null });
        toast.success('Camion retiré de la livraison.');
        await refreshClientDeliveries();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  };

  const driverName = (id?: string) => {
    if (!id) return '—';
    const d = drivers.find((x) => x.id === id);
    return d ? `${d.prenom} ${d.nom}`.trim() : '—';
  };

  return (
    <div className="space-y-6 border-t pt-4 mt-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Truck className="h-4 w-4" />
        Opérations camion
      </div>

      {/* Bons */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-medium">Bons de chargement ({loadings.length})</h3>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setLinkLoadingOpen(true)}>
              <Link2 className="h-3.5 w-3.5 mr-1" />
              Lier
            </Button>
            <Button type="button" size="sm" onClick={openCreateLoading}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Nouveau bon
            </Button>
          </div>
        </div>
        {loadings.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun bon rattaché à ce camion.</p>
        ) : (
          <ul className="space-y-2">
            {loadings.map((l) => (
              <li
                key={l.id}
                className="rounded-lg border p-3 text-sm space-y-1 bg-muted/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {l.numeroBon?.trim() || l.designation}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.fournisseurNom || 'Fournisseur'} · {l.designation}
                      {l.quantite != null ? ` · ${l.quantite} ${l.unite || ''}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {formatSupplierLoadingStatusFr(l.statut as SupplierLoadingStatus)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Commandes : {summarizeLoadingAssignments(l.assignments)}
                </p>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => void detachLoading(l)}
                  >
                    <Unlink className="h-3 w-3 mr-1" />
                    Détacher
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          Gestion détaillée aussi sur{' '}
          <Link to="/chargements" className="underline underline-offset-2">
            Chargements
          </Link>
          .
        </p>
      </section>

      {/* Livraisons */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-medium">Livraisons ({deliveries.length})</h3>
          <Button type="button" size="sm" className="self-start sm:self-auto" onClick={openAssignDelivery}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Assigner
          </Button>
        </div>
        {deliveries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune livraison assignée à ce camion.</p>
        ) : (
          <ul className="space-y-2">
            {deliveries.map((d) => (
              <li key={d.id} className="rounded-lg border p-3 text-sm space-y-1 bg-muted/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.lieuLivraison}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {d.orderDesignation || d.clientNom || 'Commande'}
                      {d.modeSortie ? ` · ${formatDeliveryExitModeFr(d.modeSortie)}` : ''}
                      {` · ${driverName(d.chauffeurId)}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {formatClientDeliveryStatusFr(d.statut)}
                  </Badge>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => void detachDelivery(d)}
                  >
                    <Unlink className="h-3 w-3 mr-1" />
                    Retirer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Commandes liées */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Commandes liées ({linkedOrders.length})</h3>
        </div>
        {linkedOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucune commande via les bons ou livraisons de ce camion.
          </p>
        ) : (
          <ul className="space-y-2">
            {linkedOrders.map((o) => (
              <li key={o.id} className="rounded-lg border p-3 text-sm bg-muted/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{o.designation}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {o.clientNom || 'Client'}
                      {o.reference ? ` · réf. ${o.reference}` : ''}
                      {o.quantite != null ? ` · ${o.quantite} ${o.unite || ''}` : ''}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {formatClientOrderStatusFr(o.statut)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          Les commandes se créent côté{' '}
          <Link to="/clients" className="underline underline-offset-2">
            Clients
          </Link>
          .
        </p>
      </section>

      {/* Dialog nouveau bon */}
      <Dialog open={createLoadingOpen} onOpenChange={setCreateLoadingOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau bon pour ce camion</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreateLoading} className="space-y-3">
            <div>
              <Label>Fournisseur</Label>
              <ThirdPartyPicker
                className="mt-1"
                options={suppliers}
                value={loadingForm.fournisseurId}
                onValueChange={(fournisseurId) =>
                  setLoadingForm((p) => ({
                    ...p,
                    fournisseurId,
                    articleId: '',
                    designation: '',
                    prixUnitaire: undefined,
                    montantBon: undefined,
                  }))
                }
                placeholder="Choisir un fournisseur…"
              />
            </div>
            <div>
              <Label>N° bon</Label>
              <Input
                className="mt-1"
                value={loadingForm.numeroBon}
                onChange={(e) => setLoadingForm((p) => ({ ...p, numeroBon: e.target.value }))}
              />
            </div>
            <div>
              <Label>Article</Label>
              <Select
                value={loadingForm.articleId || '__none__'}
                onValueChange={(v) => {
                  const articleId = v === '__none__' ? '' : v;
                  const art = articles.find((a) => a.id === articleId);
                  const prix = articleId
                    ? getArticleSupplierUnitPrice(articles, articleId, loadingForm.fournisseurId)
                    : undefined;
                  setLoadingForm((p) => ({
                    ...p,
                    articleId,
                    designation: art?.libelle || p.designation,
                    unite: art?.unite || p.unite,
                    prixUnitaire: prix,
                    montantBon: computeLineAmount(p.quantite, prix) ?? p.montantBon,
                  }));
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Article…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Libre</SelectItem>
                  {supplierArticles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {formatArticleSupplierPriceLabel(a, loadingForm.fournisseurId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Désignation</Label>
              <Input
                className="mt-1"
                required
                value={loadingForm.designation}
                onChange={(e) => setLoadingForm((p) => ({ ...p, designation: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Quantité</Label>
                <NumberInput
                  className="mt-1"
                  value={loadingForm.quantite}
                  onChange={(quantite) =>
                    setLoadingForm((p) => ({
                      ...p,
                      quantite,
                      montantBon: computeLineAmount(quantite, p.prixUnitaire) ?? p.montantBon,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Unité</Label>
                <Input
                  className="mt-1"
                  value={loadingForm.unite}
                  onChange={(e) => setLoadingForm((p) => ({ ...p, unite: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Montant bon (FCFA)</Label>
              <NumberInput
                className="mt-1"
                value={loadingForm.montantBon}
                onChange={(montantBon) => setLoadingForm((p) => ({ ...p, montantBon }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date chargement</Label>
                <Input
                  type="date"
                  className="mt-1"
                  required
                  value={loadingForm.dateChargement}
                  onChange={(e) =>
                    setLoadingForm((p) => ({ ...p, dateChargement: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Date livraison</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={loadingForm.dateLivraison}
                  onChange={(e) =>
                    setLoadingForm((p) => ({ ...p, dateLivraison: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Lieu</Label>
              <Input
                className="mt-1"
                value={loadingForm.lieu}
                onChange={(e) => setLoadingForm((p) => ({ ...p, lieu: e.target.value }))}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={loadingForm.notes}
                onChange={(e) => setLoadingForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreateLoadingOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Créer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog lier bon */}
      <Dialog open={linkLoadingOpen} onOpenChange={setLinkLoadingOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Lier un bon existant</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitLinkLoading} className="space-y-3">
            <div>
              <Label>Bon disponible</Label>
              <Select value={linkLoadingId || '__none__'} onValueChange={(v) => setLinkLoadingId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {linkableLoadings.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {(l.numeroBon || l.designation) +
                        (l.fournisseurNom ? ` · ${l.fournisseurNom}` : '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkableLoadings.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Aucun bon libre à rattacher.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkLoadingOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting || !linkLoadingId}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Rattacher
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog assigner livraison */}
      <Dialog open={assignDeliveryOpen} onOpenChange={setAssignDeliveryOpen}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assigner une livraison</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAssignDelivery} className="space-y-3">
            <div>
              <Label>Mode</Label>
              <Select
                value={assignMode}
                onValueChange={(v) => setAssignMode(v as 'existing' | 'new')}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Livraison existante</SelectItem>
                  <SelectItem value="new">Nouvelle livraison</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignMode === 'existing' ? (
              <div>
                <Label>Livraison</Label>
                <Select
                  value={assignDeliveryId || '__none__'}
                  onValueChange={(v) => setAssignDeliveryId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {assignableDeliveries.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.lieuLivraison}
                        {d.orderDesignation ? ` · ${d.orderDesignation}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Commande</Label>
                  <Select
                    value={newDeliveryForm.clientOrderId || '__none__'}
                    onValueChange={(v) => {
                      const clientOrderId = v === '__none__' ? '' : v;
                      const order = activeOrders.find((o) => o.id === clientOrderId);
                      setNewDeliveryForm((p) => ({
                        ...p,
                        clientOrderId,
                        lieuLivraison: order?.destination || p.lieuLivraison,
                      }));
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Commande…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {activeOrders.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.designation}
                          {o.clientNom ? ` · ${o.clientNom}` : ''}
                          {o.reference ? ` (${o.reference})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mode de sortie</Label>
                  <Select
                    value={newDeliveryForm.modeSortie}
                    onValueChange={(v) => {
                      const modeSortie = v as ClientDeliveryExitMode;
                      const order = activeOrders.find((o) => o.id === newDeliveryForm.clientOrderId);
                      setNewDeliveryForm((p) => ({
                        ...p,
                        modeSortie,
                        lieuLivraison: deliveryLieuForExitMode(
                          modeSortie,
                          '',
                          order?.destination || p.lieuLivraison,
                        ),
                      }));
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                    {DELIVERY_EXIT_MODE_OPTIONS.filter((m) => m.value !== 'retrait_hub').map(
                      (m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ),
                    )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lieu</Label>
                  <Input
                    className="mt-1"
                    required
                    value={newDeliveryForm.lieuLivraison}
                    onChange={(e) =>
                      setNewDeliveryForm((p) => ({ ...p, lieuLivraison: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Chauffeur</Label>
                  <Select
                    value={newDeliveryForm.chauffeurId || '__none__'}
                    onValueChange={(v) =>
                      setNewDeliveryForm((p) => ({
                        ...p,
                        chauffeurId: v === '__none__' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Chauffeur…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.prenom} {d.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Transport (FCFA)</Label>
                  <NumberInput
                    className="mt-1"
                    value={newDeliveryForm.montantTransport}
                    onChange={(montantTransport) =>
                      setNewDeliveryForm((p) => ({ ...p, montantTransport }))
                    }
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    className="mt-1"
                    rows={2}
                    value={newDeliveryForm.notes}
                    onChange={(e) => setNewDeliveryForm((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAssignDeliveryOpen(false)}>
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
  );
}
