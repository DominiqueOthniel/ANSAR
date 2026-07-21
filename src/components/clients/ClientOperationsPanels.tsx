import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, ClientOrder, ClientDelivery, SupplierLoading } from '@/contexts/AppContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { frCollator, stableSort } from '@/lib/list-sort';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, ClipboardList, Truck, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  computeLineAmount,
  formatArticleSupplierPriceLabel,
  formatArticleSalePriceLabel,
  getArticleSupplierUnitPrice,
  getArticleSaleUnitPrice,
  listArticlesForSupplier,
  listArticlesForClientOrders,
} from '@/lib/article-pricing';
import {
  CLIENT_ORDER_STATUS_OPTIONS,
  CLIENT_DELIVERY_STATUS_OPTIONS,
  formatClientOrderStatusFr,
  formatClientDeliveryStatusFr,
  buildOrderClientFields,
  canDeleteClientOrder,
  formatClientAccountKindFr,
  getClientAccountKind,
  isClientOrderEditable,
  isValidUuid,
  sanitizeOptionalUuid,
  type ClientOrderStatus,
  type ClientDeliveryStatus,
} from '@/lib/client-operations';
import {
  canLinkClientOrderToLoading,
  findSupplierLoadingForOrder,
  formatSupplierLoadingBonOption,
  getActiveLoadingAssignments,
  isSupplierLoadingAvailableForOrder,
  validateLoadingAssignmentRows,
} from '@/lib/supplier-loadings';
import {
  DELIVERY_EXIT_MODE_OPTIONS,
  HUB_PRESETS,
  LOADING_ENTRY_MODE_OPTIONS,
  deliveryLieuForExitMode,
  formatDeliveryExitModeFr,
  type ClientDeliveryExitMode,
  type LoadingEntryMode,
} from '@/lib/hub-transit';
import { checkPretAccordePlafond } from '@/lib/client-credit-plafond';
import { PaymentAtCreationFields } from '@/components/PaymentAtCreationFields';
import {
  paymentModeFromInvoice,
  resolvePaymentAtCreation,
  type PaymentAtCreationMode,
} from '@/lib/payment-at-creation';
import {
  loadCreditsForPlafond,
  thirdPartiesToClientTierLike,
} from '@/lib/client-initial-balance';
import { linkDriverTruckSelection } from '@/lib/driver-truck-link';

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  clientId?: string;
  clientLabel?: string;
  isWalkIn?: boolean;
  defaultDestination?: string;
};

export function ClientOperationsPanels({
  clientId,
  clientLabel = 'Client comptoir',
  isWalkIn = false,
  defaultDestination,
}: Props) {
  const {
    clientOrders,
    clientDeliveries,
    articles,
    invoices,
    drivers,
    trucks,
    thirdParties,
    supplierLoadings,
    createClientOrder,
    updateClientOrder,
    deleteClientOrder,
    createClientDelivery,
    updateClientDelivery,
    deleteClientDelivery,
    createSupplierLoading,
    setSupplierLoadingAssignments,
  } = useApp();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const orders = useMemo(
    () =>
      clientOrders
        .filter((o) => (isWalkIn ? !o.clientId : o.clientId === clientId))
        .sort((a, b) => b.dateCommande.localeCompare(a.dateCommande)),
    [clientOrders, clientId, isWalkIn],
  );

  const activeOrders = useMemo(
    () => orders.filter((o) => o.statut !== 'livree' && o.statut !== 'annulee'),
    [orders],
  );

  const closedOrders = useMemo(
    () => orders.filter((o) => o.statut === 'livree' || o.statut === 'annulee'),
    [orders],
  );

  const deliveries = useMemo(() => {
    const orderIds = new Set(orders.map((o) => o.id));
    return clientDeliveries
      .filter((d) => {
        if (orderIds.has(d.clientOrderId)) return true;
        if (isWalkIn) return !d.clientId;
        return d.clientId === clientId;
      })
      .sort((a, b) =>
        (b.dateLivraison ?? '').localeCompare(a.dateLivraison ?? ''),
      );
  }, [clientDeliveries, orders, clientId, isWalkIn]);

  const fournisseurs = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'fournisseur' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const activeTrucks = useMemo(
    () =>
      stableSort(
        trucks.filter((t) => t.statut === 'actif'),
        (a, b) => frCollator.compare(a.immatriculation, b.immatriculation),
      ),
    [trucks],
  );

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ClientOrder | null>(null);
  const catalogArticles = useMemo(
    () => listArticlesForClientOrders(articles),
    [articles],
  );

  const [orderForm, setOrderForm] = useState({
    supplierLoadingId: '',
    articleId: '',
    clientNom: '',
    clientTelephone: '',
    clientAdresse: '',
    reference: '',
    designation: '',
    destination: defaultDestination ?? '',
    montant: undefined as number | undefined,
    prixUnitaire: undefined as number | undefined,
    quantite: undefined as number | undefined,
    unite: '',
    statut: 'confirmee' as ClientOrderStatus,
    dateCommande: todayIso(),
    dateLivraisonSouhaitee: '',
    notes: '',
    paiementMode: 'en_attente' as PaymentAtCreationMode,
    montantAvance: undefined as number | undefined,
    datePaiement: todayIso(),
  });

  const [loadingDialogOpen, setLoadingDialogOpen] = useState(false);
  const [loadingForm, setLoadingForm] = useState({
    fournisseurId: '',
    numeroBon: '',
    articleId: '',
    modeEntree: 'bon_simple' as LoadingEntryMode,
    camionId: '',
    hubArrivee: HUB_PRESETS[0] as string,
    dateChargement: todayIso(),
    dateLivraison: '',
    designation: '',
    quantite: undefined as number | undefined,
    unite: '',
    prixUnitaireFournisseur: undefined as number | undefined,
    montantBon: undefined as number | undefined,
    montantBonTouched: false,
    lieu: '',
    notes: '',
  });

  const loadingArticlesForFournisseur = useMemo(
    () => listArticlesForSupplier(articles, loadingForm.fournisseurId),
    [articles, loadingForm.fournisseurId],
  );

  const loadingSiteOptions = useMemo(() => {
    if (!loadingForm.fournisseurId) return [];
    const sites = new Set<string>();
    const fournisseur = thirdParties.find((tp) => tp.id === loadingForm.fournisseurId);
    if (fournisseur?.adresse?.trim()) sites.add(fournisseur.adresse.trim());
    supplierLoadings
      .filter((l) => l.fournisseurId === loadingForm.fournisseurId)
      .forEach((l) => {
        if (l.lieu?.trim()) sites.add(l.lieu.trim());
      });
    return stableSort([...sites], (a, b) => frCollator.compare(a, b));
  }, [loadingForm.fournisseurId, supplierLoadings, thirdParties]);

  const selectableLoadings = useMemo(
    () =>
      stableSort(
        supplierLoadings.filter(
          (l) =>
            canLinkClientOrderToLoading(l.statut) &&
            isSupplierLoadingAvailableForOrder(l, editingOrder?.id),
        ),
        (a, b) => b.dateChargement.localeCompare(a.dateChargement),
      ),
    [supplierLoadings, editingOrder?.id],
  );

  const recalcMontant = (quantite?: number, prixUnitaire?: number) =>
    computeLineAmount(quantite, prixUnitaire);

  const syncLoadingBonValue = (
    base: typeof loadingForm,
    patch: Partial<typeof loadingForm>,
  ): typeof loadingForm => {
    const next = { ...base, ...patch };
    const article = next.articleId
      ? articles.find((a) => a.id === next.articleId)
      : undefined;
    const prixUnitaire =
      next.prixUnitaireFournisseur ??
      (next.fournisseurId ? getArticleSupplierUnitPrice(article, next.fournisseurId) : undefined);
    const montantBon = computeLineAmount(next.quantite, prixUnitaire);
    return {
      ...next,
      prixUnitaireFournisseur: prixUnitaire,
      montantBon: next.montantBonTouched ? next.montantBon : montantBon ?? next.montantBon,
    };
  };

  useEffect(() => {
    const next = recalcMontant(orderForm.quantite, orderForm.prixUnitaire);
    if (next != null) {
      setOrderForm((p) => (p.montant === next ? p : { ...p, montant: next }));
    }
  }, [orderForm.quantite, orderForm.prixUnitaire]);

  const applyArticleToOrder = (articleId: string) => {
    const article = articles.find((a) => a.id === articleId);
    const pu = getArticleSaleUnitPrice(article);
    if (!article || pu == null) return;
    const calculated = recalcMontant(orderForm.quantite, pu);
    setOrderForm((p) => ({
      ...p,
      articleId,
      designation: p.designation.trim() ? p.designation : article.libelle,
      unite: article.unite || p.unite,
      prixUnitaire: pu,
      montant: calculated ?? p.montant,
    }));
    toast.info(`Tarif : ${pu.toLocaleString('fr-FR')} FCFA / ${article.unite}`);
  };

  const applyLoadingToOrderForm = (loading: SupplierLoading) => {
    const article = loading.articleId
      ? articles.find((a) => a.id === loading.articleId)
      : undefined;
    const pu = getArticleSaleUnitPrice(article);
    const qty = loading.quantite;
    const calculated =
      pu != null && qty != null && qty > 0 ? recalcMontant(qty, pu) : undefined;
    setOrderForm((p) => ({
      ...p,
      supplierLoadingId: loading.id,
      articleId: loading.articleId ?? p.articleId,
      reference: loading.numeroBon?.trim() || p.reference,
      designation: loading.designation,
      unite: loading.unite || p.unite,
      quantite: qty ?? p.quantite,
      prixUnitaire: pu ?? p.prixUnitaire,
      montant: calculated ?? p.montant,
    }));
  };

  const openCreateLoadingForOrder = () => {
    setLoadingForm({
      fournisseurId: '',
      numeroBon: orderForm.reference,
      articleId: '',
      modeEntree: 'bon_simple',
      camionId: '',
      hubArrivee: HUB_PRESETS[0],
      dateChargement: orderForm.dateCommande || todayIso(),
      dateLivraison: orderForm.dateLivraisonSouhaitee,
      designation: orderForm.designation,
      quantite: orderForm.quantite,
      unite: orderForm.unite,
      prixUnitaireFournisseur: undefined,
      montantBon: undefined,
      montantBonTouched: false,
      lieu: '',
      notes: orderForm.destination ? `Client: ${orderForm.destination}` : '',
    });
    setLoadingDialogOpen(true);
  };

  const submitLoadingFromClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadingForm.fournisseurId) {
      toast.error('Choisissez un fournisseur.');
      return;
    }
    if (!loadingForm.designation.trim()) {
      toast.error('Désignation du bon obligatoire.');
      return;
    }
    if (loadingForm.modeEntree === 'camion_ansar' && !loadingForm.camionId) {
      toast.error('Choisissez le camion SIA-ANSAR utilisé pour ce bon.');
      return;
    }

    await withGuard(async () => {
      try {
        const isCamrail = loadingForm.modeEntree === 'rail';
        const isCamionAnsar =
          loadingForm.modeEntree === 'camion_ansar' || loadingForm.modeEntree === 'camion';
        const created = await createSupplierLoading({
          fournisseurId: loadingForm.fournisseurId,
          numeroBon: loadingForm.numeroBon.trim() || undefined,
          articleId: loadingForm.articleId || undefined,
          designation: loadingForm.designation.trim(),
          quantite: loadingForm.quantite,
          unite: loadingForm.unite.trim() || undefined,
          montantBon: loadingForm.montantBon,
          dateChargement: loadingForm.dateChargement,
          dateLivraison: loadingForm.dateLivraison || undefined,
          modeEntree: loadingForm.modeEntree,
          camionId: isCamionAnsar ? loadingForm.camionId || undefined : undefined,
          hubArrivee: isCamrail ? loadingForm.hubArrivee.trim() || HUB_PRESETS[0] : undefined,
          lieu: isCamrail
            ? loadingForm.hubArrivee.trim() || HUB_PRESETS[0]
            : loadingForm.lieu.trim() || undefined,
          notes: loadingForm.notes.trim() || undefined,
        });
        setOrderForm((p) => ({
          ...p,
          supplierLoadingId: created.id,
          articleId: p.articleId || created.articleId || '',
          reference: p.reference.trim() ? p.reference : created.numeroBon ?? p.reference,
          designation: p.designation.trim() ? p.designation : created.designation,
          quantite: p.quantite ?? created.quantite,
          unite: p.unite.trim() ? p.unite : created.unite ?? p.unite,
          prixUnitaire: p.prixUnitaire ?? loadingForm.prixUnitaireFournisseur,
          montant:
            p.montant ??
            computeLineAmount(p.quantite ?? created.quantite, loadingForm.prixUnitaireFournisseur) ??
            p.montant,
        }));
        setLoadingDialogOpen(false);
        toast.success('Bon créé et sélectionné pour la commande.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la création du bon');
      }
    });
  };

  const linkOrderToLoading = async (orderId: string, loadingId: string, qty?: number) => {
    const loading = supplierLoadings.find((l) => l.id === loadingId);
    if (!loading) return;
    if (!isSupplierLoadingAvailableForOrder(loading, orderId)) {
      toast.error('Ce bon n’a plus de quantité disponible.');
      return;
    }
    const existing = getActiveLoadingAssignments(loading.assignments ?? []).map((a) => ({
      clientOrderId: a.clientOrderId,
      quantiteAffectee: a.quantiteAffectee,
      notes: a.notes,
    }));
    if (existing.some((a) => a.clientOrderId === orderId)) return;

    const nextRows = [...existing, { clientOrderId: orderId, quantiteAffectee: qty }];
    const err = validateLoadingAssignmentRows(loading.quantite, loading.unite, nextRows);
    if (err) {
      toast.error(err);
      return;
    }
    await setSupplierLoadingAssignments(loading.id, nextRows);
  };

  const invoiceForOrder = (order: ClientOrder) =>
    invoices.find(
      (inv) => inv.id === order.invoiceId || inv.clientOrderId === order.id,
    );

  const invoiceForDelivery = (delivery: ClientDelivery) => {
    const order = orders.find((o) => o.id === delivery.clientOrderId);
    if (!order) return undefined;
    return invoiceForOrder(order);
  };

  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<ClientDelivery | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    clientOrderId: '',
    modeSortie: 'livraison_directe' as ClientDeliveryExitMode,
    lieuLivraison: defaultDestination ?? '',
    statut: 'planifiee' as ClientDeliveryStatus,
    dateLivraison: '',
    chauffeurId: '',
    tracteurId: '',
    montantTransport: undefined as number | undefined,
    transportFactureParFournisseur: false,
    transportFournisseurId: '',
    notes: '',
  });

  const hubForOrder = (orderId: string): string => {
    const linked = findSupplierLoadingForOrder(supplierLoadings, orderId);
    return linked?.hubArrivee?.trim() || HUB_PRESETS[0];
  };

  const resetOrderForm = () => {
    setOrderForm({
      supplierLoadingId: '',
      articleId: '',
      clientNom: '',
      clientTelephone: '',
      clientAdresse: '',
      reference: '',
      designation: '',
      destination: defaultDestination ?? '',
      montant: undefined,
      prixUnitaire: undefined,
      quantite: undefined,
      unite: '',
      statut: 'confirmee',
      dateCommande: todayIso(),
      dateLivraisonSouhaitee: '',
      notes: '',
      paiementMode: 'en_attente',
      montantAvance: undefined,
      datePaiement: todayIso(),
    });
    setEditingOrder(null);
  };

  const openNewOrder = () => {
    resetOrderForm();
    setOrderDialogOpen(true);
  };

  const handleDeleteOrder = async (o: ClientOrder) => {
    const locked = !isClientOrderEditable(o.statut);
    const warn = locked
      ? '\n\nCette commande est terminée : la suppression est définitive.'
      : '';
    if (!confirm(`Supprimer la commande « ${o.designation} » ?${warn}`)) return;
    try {
      await deleteClientOrder(o.id);
      toast.success('Commande supprimée');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  const handleDeleteDelivery = async (d: ClientDelivery) => {
    if (d.statut !== 'annulee') {
      toast.error('Annulez d’abord la livraison avant de la supprimer.');
      return;
    }
    if (!confirm(`Supprimer la livraison « ${d.lieuLivraison} » ?`)) return;
    try {
      await deleteClientDelivery(d.id);
      toast.success('Livraison supprimée');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  const openEditOrder = (o: ClientOrder) => {
    if (!isClientOrderEditable(o.statut)) {
      toast.error('Cette commande est livrée ou annulée et ne peut plus être modifiée.');
      return;
    }
    const linked = findSupplierLoadingForOrder(supplierLoadings, o.id);
    const inv = invoiceForOrder(o);
    const invPay =
      inv && inv.montantTTC > 0
        ? paymentModeFromInvoice(inv.montantTTC, inv.montantPaye, inv.statut)
        : { mode: 'en_attente' as PaymentAtCreationMode, montantAvance: undefined };
    setEditingOrder(o);
    setOrderForm({
      supplierLoadingId: linked?.id ?? '',
      articleId: o.articleId ?? '',
      clientNom: o.clientNom ?? '',
      clientTelephone: o.clientTelephone ?? '',
      clientAdresse: o.clientAdresse ?? '',
      reference: o.reference ?? '',
      designation: o.designation,
      destination: o.destination ?? '',
      montant: o.montant,
      prixUnitaire: o.prixUnitaire,
      quantite: o.quantite,
      unite: o.unite ?? '',
      statut: o.statut,
      dateCommande: o.dateCommande,
      dateLivraisonSouhaitee: o.dateLivraisonSouhaitee ?? '',
      notes: o.notes ?? '',
      paiementMode: invPay.mode,
      montantAvance: invPay.montantAvance,
      datePaiement: inv?.datePaiement ?? inv?.dateCreation ?? todayIso(),
    });
    setOrderDialogOpen(true);
  };

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForm.designation.trim()) {
      toast.error('Désignation de la commande obligatoire.');
      return;
    }
    await withGuard(async () => {
      try {
        if (editingOrder && !isClientOrderEditable(editingOrder.statut)) {
          toast.error('Cette commande est livrée ou annulée et ne peut plus être modifiée.');
          return;
        }
        const finalMontant =
          recalcMontant(orderForm.quantite, orderForm.prixUnitaire) ?? orderForm.montant;
        const montantCmd = Math.round(finalMontant ?? 0);
        const payment =
          montantCmd > 0
            ? resolvePaymentAtCreation({
                mode: orderForm.paiementMode,
                montantTotal: montantCmd,
                montantAvance: orderForm.montantAvance,
              })
            : null;
        if (
          orderForm.paiementMode === 'avance' &&
          montantCmd > 0 &&
          (orderForm.montantAvance == null || orderForm.montantAvance <= 0)
        ) {
          toast.error('Indiquez le montant de l’acompte encaissé.');
          return;
        }
        if (!isWalkIn && !clientId?.trim()) {
          toast.error('Client invalide : ouvrez la fiche client avant d’enregistrer.');
          return;
        }
        if (!isWalkIn && !editingOrder && !isValidUuid(clientId)) {
          toast.error('Identifiant client invalide : rouvrez la fiche client et réessayez.');
          return;
        }
        if (isWalkIn && !orderForm.clientNom.trim()) {
          toast.error('Indiquez au moins le nom du client comptoir.');
          return;
        }
        let clientFields: {
          clientId?: string;
          clientNom?: string;
          clientTelephone?: string;
          clientAdresse?: string;
        } = {};
        if (!editingOrder || isWalkIn) {
          try {
            clientFields = buildOrderClientFields(
              isWalkIn,
              clientId,
              isWalkIn ? orderForm.clientNom : clientLabel,
              {
                telephone: orderForm.clientTelephone,
                adresse: orderForm.clientAdresse,
              },
            );
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Client invalide.');
            return;
          }
        }
        const payload = {
          ...clientFields,
          articleId: sanitizeOptionalUuid(orderForm.articleId),
          reference: orderForm.reference.trim() || undefined,
          designation: orderForm.designation.trim(),
          destination: orderForm.destination.trim() || undefined,
          montant: finalMontant,
          prixUnitaire: orderForm.prixUnitaire,
          quantite: orderForm.quantite,
          unite: orderForm.unite.trim() || undefined,
          statut: orderForm.statut,
          dateCommande: orderForm.dateCommande,
          dateLivraisonSouhaitee: orderForm.dateLivraisonSouhaitee || undefined,
          notes: orderForm.notes.trim() || undefined,
          ...(payment
            ? {
                montantPaye: payment.montantPaye,
                datePaiement:
                  payment.montantPaye > 0 ? orderForm.datePaiement : undefined,
              }
            : {}),
        };
        const selectedLoadingId = orderForm.supplierLoadingId.trim();
        if (selectedLoadingId) {
          const selectedLoading = supplierLoadings.find((l) => l.id === selectedLoadingId);
          if (
            selectedLoading &&
            !isSupplierLoadingAvailableForOrder(selectedLoading, editingOrder?.id)
          ) {
            toast.error('Ce bon n’a plus de quantité disponible.');
            return;
          }
        }
        if (editingOrder) {
          await updateClientOrder(editingOrder.id, payload);
          const prevLoading = findSupplierLoadingForOrder(supplierLoadings, editingOrder.id);
          const nextId = selectedLoadingId;
          if (prevLoading && prevLoading.id !== nextId) {
            const remaining = (prevLoading.assignments ?? [])
              .filter((a) => a.clientOrderId !== editingOrder.id)
              .map((a) => ({
                clientOrderId: a.clientOrderId,
                quantiteAffectee: a.quantiteAffectee,
                notes: a.notes,
              }));
            await setSupplierLoadingAssignments(prevLoading.id, remaining);
          }
          if (nextId && (!prevLoading || prevLoading.id !== nextId)) {
            await linkOrderToLoading(editingOrder.id, nextId, orderForm.quantite);
          }
          toast.success(
            payload.statut === 'livree'
              ? 'Commande marquée livrée — retirée des commandes actives'
              : 'Commande mise à jour',
          );
        } else {
          const client = isWalkIn
            ? undefined
            : thirdParties.find((tp) => tp.id === clientId && tp.type === 'client');
          const montantCmd = finalMontant ?? 0;
          if (client?.plafondCredit != null && montantCmd > 0) {
            const credits = await loadCreditsForPlafond();
            const chk = checkPretAccordePlafond({
              credits,
              thirdParties: thirdPartiesToClientTierLike(thirdParties),
              preteur: client.nom,
              clientTierId: clientId ?? '',
              montantTotal: montantCmd,
              invoices,
            });
            if (!chk.ok) {
              toast.error(chk.message);
              return;
            }
          }
          const created = await createClientOrder(payload);
          if (orderForm.supplierLoadingId.trim()) {
            await linkOrderToLoading(
              created.id,
              orderForm.supplierLoadingId.trim(),
              orderForm.quantite,
            );
            const payMsg =
              payment && payment.montantPaye > 0
                ? payment.statut === 'payee'
                  ? ' — facture soldée'
                  : ` — acompte ${payment.montantPaye.toLocaleString('fr-FR')} FCFA`
                : '';
            toast.success(`Commande enregistrée et liée au bon fournisseur${payMsg}`);
          } else {
            const payMsg =
              payment && payment.montantPaye > 0
                ? payment.statut === 'payee'
                  ? ' — facture soldée'
                  : ` — acompte ${payment.montantPaye.toLocaleString('fr-FR')} FCFA`
                : '';
            toast.success(`Commande enregistrée${payMsg}`);
          }
        }
        setOrderDialogOpen(false);
        resetOrderForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  };

  const resetDeliveryForm = (orderId?: string) => {
    const order = orderId ? orders.find((o) => o.id === orderId) : undefined;
    const linked = orderId ? findSupplierLoadingForOrder(supplierLoadings, orderId) : undefined;
    const hub = linked?.hubArrivee?.trim() || HUB_PRESETS[0];
    const modeSortie: ClientDeliveryExitMode = linked?.hubArrivee || linked?.modeEntree === 'rail'
      ? 'retrait_hub'
      : 'livraison_directe';
    setDeliveryForm({
      clientOrderId: orderId ?? '',
      modeSortie,
      lieuLivraison: deliveryLieuForExitMode(
        modeSortie,
        hub,
        order?.destination ?? defaultDestination ?? '',
      ),
      statut: 'planifiee',
      dateLivraison: '',
      chauffeurId: '',
      tracteurId: '',
      montantTransport: undefined,
      transportFactureParFournisseur: false,
      transportFournisseurId: '',
      notes: '',
    });
    setEditingDelivery(null);
  };

  const openNewDelivery = (orderId?: string) => {
    if (activeOrders.length === 0) {
      toast.error('Aucune commande active : créez une commande ou réouvrez une livraison existante.');
      return;
    }
    resetDeliveryForm(orderId ?? activeOrders[0].id);
    setDeliveryDialogOpen(true);
  };

  const openEditDelivery = (d: ClientDelivery) => {
    setEditingDelivery(d);
    setDeliveryForm({
      clientOrderId: d.clientOrderId,
      modeSortie: d.modeSortie ?? 'livraison_directe',
      lieuLivraison: d.lieuLivraison,
      statut: d.statut,
      dateLivraison: d.dateLivraison ?? '',
      chauffeurId: d.chauffeurId ?? '',
      tracteurId: d.tracteurId ?? '',
      montantTransport: d.montantTransport,
      transportFactureParFournisseur: d.transportFactureParFournisseur === true,
      transportFournisseurId: d.transportFournisseurId ?? '',
      notes: d.notes ?? '',
    });
    setDeliveryDialogOpen(true);
  };

  const submitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    const linkedOrderId =
      deliveryForm.clientOrderId || editingDelivery?.clientOrderId || '';
    if (!linkedOrderId) {
      toast.error('Sélectionnez la commande liée.');
      return;
    }
    if (!deliveryForm.lieuLivraison.trim()) {
      toast.error('Lieu de livraison obligatoire.');
      return;
    }
    const isRetraitHub = deliveryForm.modeSortie === 'retrait_hub';
    const billedBySupplier = !isRetraitHub && deliveryForm.transportFactureParFournisseur;
    if (billedBySupplier && !deliveryForm.transportFournisseurId) {
      toast.error('Indiquez le fournisseur qui vous facture le transport.');
      return;
    }
    await withGuard(async () => {
      try {
        const payload = {
          clientOrderId: linkedOrderId,
          modeSortie: deliveryForm.modeSortie,
          lieuLivraison: deliveryForm.lieuLivraison.trim(),
          statut: deliveryForm.statut,
          dateLivraison: deliveryForm.dateLivraison || undefined,
          chauffeurId: isRetraitHub ? undefined : deliveryForm.chauffeurId || undefined,
          tracteurId: isRetraitHub ? undefined : deliveryForm.tracteurId || undefined,
          transportFactureParFournisseur: billedBySupplier,
          transportFournisseurId: billedBySupplier
            ? deliveryForm.transportFournisseurId
            : undefined,
          montantTransport: isRetraitHub
            ? undefined
            : deliveryForm.montantTransport != null && deliveryForm.montantTransport > 0
              ? deliveryForm.montantTransport
              : null,
          notes: deliveryForm.notes.trim() || undefined,
        };
        if (editingDelivery) {
          await updateClientDelivery(editingDelivery.id, payload);
          toast.success(
            payload.statut === 'livree'
              ? 'Livraison effectuée — commande passée en livrée et retirée des actives si toutes les livraisons sont faites'
              : 'Livraison mise à jour',
          );
        } else {
          await createClientDelivery(payload);
          toast.success(
            payload.statut === 'livree'
              ? 'Livraison effectuée — commande mise à jour'
              : 'Livraison planifiée',
          );
        }
        setDeliveryDialogOpen(false);
        resetDeliveryForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
      }
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-violet-600" />
            Commandes actives ({activeOrders.length})
          </h3>
          <Button type="button" size="sm" variant="secondary" onClick={openNewOrder}>
            <Plus className="h-3 w-3 mr-1" />
            Nouvelle commande
          </Button>
        </div>
        {activeOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune commande active — enregistrez la demande du donneur d’ordre (produit, quantité, destination).
          </p>
        ) : (
          <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {activeOrders.map((o) => {
              const dCount = deliveries.filter((d) => d.clientOrderId === o.id).length;
              const linkedLoading = findSupplierLoadingForOrder(supplierLoadings, o.id);
              return (
                <li key={o.id} className="rounded-lg border bg-card p-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{o.designation}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.dateCommande}
                        {o.reference ? ` · ${o.reference}` : ''}
                        {o.destination ? ` · ${o.destination}` : ''}
                      </p>
                      {!o.clientId && o.clientNom && (
                        <p className="text-xs font-medium text-primary mt-0.5">
                          Client comptoir : {o.clientNom}
                          {o.clientTelephone ? ` · ${o.clientTelephone}` : ''}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {formatClientOrderStatusFr(o.statut)}
                    </Badge>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {formatClientAccountKindFr(getClientAccountKind(o))}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
                    {o.montant != null && o.montant > 0 && (
                      <span>{formatFcfa(o.montant)}</span>
                    )}
                    {o.quantite != null && o.quantite > 0 && (
                      <span>
                        {o.quantite} {o.unite || 'u.'}
                      </span>
                    )}
                    <span>{dCount} livraison{dCount !== 1 ? 's' : ''}</span>
                  </div>
                  {linkedLoading && (
                    <Link
                      to="/chargements"
                      className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-300 hover:underline mt-0.5"
                    >
                      Bon :{' '}
                      {linkedLoading.numeroBon?.trim() || linkedLoading.designation}
                      {linkedLoading.fournisseurNom
                        ? ` (${linkedLoading.fournisseurNom})`
                        : ''}
                    </Link>
                  )}
                  {invoiceForOrder(o) && (
                    <Link
                      to={`/factures?highlight=${invoiceForOrder(o)!.id}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      <FileText className="h-3 w-3" />
                      Facture {invoiceForOrder(o)!.numero}
                    </Link>
                  )}
                  <div className="flex gap-1 mt-2 flex-wrap items-center">
                    {isClientOrderEditable(o.statut) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditOrder(o)}
                        title="Modifier la commande"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground px-1">
                        Commande terminée (non modifiable)
                      </span>
                    )}
                    {canDeleteClientOrder(o.statut) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        title="Supprimer la commande"
                        onClick={() => void handleDeleteOrder(o)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {o.statut !== 'annulee' && o.statut !== 'livree' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openNewDelivery(o.id)}
                      >
                        <Truck className="h-3.5 w-3.5 mr-1" />
                        Livrer
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {closedOrders.length > 0 && (
          <details className="mt-3 rounded-lg border border-dashed bg-muted/20">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
              Historique — livrées / annulées ({closedOrders.length})
            </summary>
            <ul className="space-y-2 max-h-40 overflow-y-auto px-2 pb-2">
              {closedOrders.map((o) => (
                <li
                  key={o.id}
                  className="rounded-md border bg-card/80 p-2 text-sm opacity-90"
                >
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{o.designation}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.dateCommande}
                        {o.reference ? ` · ${o.reference}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {formatClientOrderStatusFr(o.statut)}
                    </Badge>
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap items-center">
                    {invoiceForOrder(o) && (
                      <Link
                        to={`/factures?highlight=${invoiceForOrder(o)!.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <FileText className="h-3 w-3" />
                        {invoiceForOrder(o)!.numero}
                      </Link>
                    )}
                    {canDeleteClientOrder(o.statut) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive h-7 px-2"
                        title="Supprimer la commande"
                        onClick={() => void handleDeleteOrder(o)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4 text-emerald-600" />
            Livraisons ({deliveries.length})
          </h3>
          <Button type="button" size="sm" variant="outline" onClick={() => openNewDelivery()}>
            <Plus className="h-3 w-3 mr-1" />
            Planifier livraison
          </Button>
        </div>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune livraison planifiée — rattachez chaque enlèvement / livraison à une commande.
          </p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {deliveries.map((d) => {
              const order = orders.find((o) => o.id === d.clientOrderId);
              return (
                <li key={d.id} className="rounded-lg border px-2.5 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium truncate">{d.lieuLivraison}</span>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <Badge variant="secondary" className="text-xs">
                        {formatClientDeliveryStatusFr(d.statut)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {formatDeliveryExitModeFr(d.modeSortie)}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {formatClientAccountKindFr(getClientAccountKind(d))}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order?.designation ?? d.orderDesignation ?? 'Commande'}
                    {d.dateLivraison ? ` · livrée ${d.dateLivraison}` : ''}
                    {d.transportFactureParFournisseur ? (
                      <span>
                        {' '}
                        · transport via {d.transportFournisseurNom ?? 'fournisseur'}
                        {d.montantTransport != null && d.montantTransport > 0
                          ? ` · refacturé client ${formatFcfa(d.montantTransport)}`
                          : ''}
                      </span>
                    ) : (
                      d.montantTransport != null &&
                      d.montantTransport > 0 && (
                        <span> · transport {formatFcfa(d.montantTransport)}</span>
                      )
                    )}
                  </p>
                  {invoiceForDelivery(d) && (
                    <Link
                      to={`/factures?highlight=${invoiceForDelivery(d)!.id}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                    >
                      <FileText className="h-3 w-3" />
                      {d.statut === 'livree' &&
                      d.montantTransport != null &&
                      d.montantTransport > 0
                        ? `Transport inclus — facture ${invoiceForDelivery(d)!.numero}`
                        : `Facture commande ${invoiceForDelivery(d)!.numero}`}
                    </Link>
                  )}
                  {d.statut !== 'livree' &&
                    d.montantTransport != null &&
                    d.montantTransport > 0 &&
                    d.modeSortie !== 'retrait_hub' && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Transport facturé automatiquement au passage en « Livrée »
                      </p>
                    )}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => openEditDelivery(d)}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Modifier
                    </Button>
                    {d.statut === 'annulee' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => handleDeleteDelivery(d)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Supprimer
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Modifier la commande' : 'Nouvelle commande'}</DialogTitle>
            <DialogDescription className="sr-only">
              Saisie ou modification d&apos;une commande client et encaissement FAC-CMD.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitOrder} className="space-y-3">
            {isWalkIn && (
              <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
                <div>
                  <Label>Nom du client comptoir *</Label>
                  <Input
                    value={orderForm.clientNom}
                    onChange={(e) => setOrderForm((p) => ({ ...p, clientNom: e.target.value }))}
                    placeholder="Ex. CIMAF 32,5R"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label>Téléphone</Label>
                    <Input
                      value={orderForm.clientTelephone}
                      onChange={(e) =>
                        setOrderForm((p) => ({ ...p, clientTelephone: e.target.value }))
                      }
                      placeholder="Ex. 6 99 00 00 00"
                    />
                  </div>
                  <div>
                    <Label>Adresse / infos</Label>
                    <Input
                      value={orderForm.clientAdresse}
                      onChange={(e) =>
                        setOrderForm((p) => ({ ...p, clientAdresse: e.target.value }))
                      }
                      placeholder="Ville, quartier, contact..."
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ces infos seront reprises sur la facture FAC-CMD et visibles dans la table Factures.
                </p>
              </div>
            )}
            <div className="space-y-1 rounded-md border border-dashed p-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Bon de chargement</Label>
                <Button type="button" size="sm" variant="secondary" onClick={openCreateLoadingForOrder}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Créer un bon
                </Button>
              </div>
              {selectableLoadings.length > 0 ? (
                <Select
                  value={orderForm.supplierLoadingId || '_none'}
                  onValueChange={(v) => {
                    if (v === '_none') {
                      setOrderForm((p) => ({ ...p, supplierLoadingId: '' }));
                      return;
                    }
                    const loading = selectableLoadings.find((l) => l.id === v);
                    if (loading) applyLoadingToOrderForm(loading);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun — saisie libre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Aucun bon —</SelectItem>
                    {selectableLoadings.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {formatSupplierLoadingBonOption(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Aucun bon disponible pour ce client. Créez-le ici ou depuis{' '}
                  <Link to="/chargements" className="text-primary font-medium hover:underline">
                    Chargements
                  </Link>
                  .
                </p>
              )}
            </div>
            <div>
              <Label>Réf. commande</Label>
              <Input
                value={orderForm.reference}
                onChange={(e) => setOrderForm((p) => ({ ...p, reference: e.target.value }))}
                placeholder="ATC-2026-042"
              />
            </div>
            {catalogArticles.length > 0 && (
              <div>
                <Label>Article catalogue</Label>
                <Select
                  value={orderForm.articleId || '_none'}
                  onValueChange={(v) => {
                    if (v === '_none') {
                      setOrderForm((p) => ({ ...p, articleId: '' }));
                      return;
                    }
                    applyArticleToOrder(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un article…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Saisie libre —</SelectItem>
                    {catalogArticles.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {formatArticleSalePriceLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Prix et montant prévu calculés depuis le tarif catalogue.
                </p>
              </div>
            )}
            <div>
              <Label>Désignation *</Label>
              <Input
                value={orderForm.designation}
                onChange={(e) => setOrderForm((p) => ({ ...p, designation: e.target.value }))}
                placeholder="Ex. 200 sacs ciment"
                required
              />
            </div>
            <div>
              <Label>Destination livraison</Label>
              <Input
                value={orderForm.destination}
                onChange={(e) => setOrderForm((p) => ({ ...p, destination: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Quantité</Label>
                <NumberInput
                  min={0}
                  value={orderForm.quantite}
                  onChange={(v) => {
                    const calculated = recalcMontant(v, orderForm.prixUnitaire);
                    setOrderForm((p) => ({
                      ...p,
                      quantite: v,
                      montant: calculated ?? p.montant,
                    }));
                  }}
                />
              </div>
              <div>
                <Label>Unité</Label>
                <Input
                  value={orderForm.unite}
                  onChange={(e) => setOrderForm((p) => ({ ...p, unite: e.target.value }))}
                  placeholder="sac, t…"
                />
              </div>
            </div>
            <div>
              <Label>Prix unitaire (FCFA)</Label>
              <NumberInput
                min={0}
                value={orderForm.prixUnitaire}
                onChange={(v) => {
                  const calculated = recalcMontant(orderForm.quantite, v);
                  setOrderForm((p) => ({
                    ...p,
                    prixUnitaire: v,
                    montant: calculated ?? p.montant,
                  }));
                }}
              />
            </div>
            <div>
              <Label>Montant prévu (FCFA)</Label>
              <NumberInput
                min={0}
                value={orderForm.montant}
                onChange={(v) => setOrderForm((p) => ({ ...p, montant: v }))}
                disabled={
                  orderForm.quantite != null &&
                  orderForm.prixUnitaire != null &&
                  orderForm.quantite > 0 &&
                  orderForm.prixUnitaire > 0
                }
              />
              {orderForm.quantite != null &&
                orderForm.prixUnitaire != null &&
                orderForm.quantite > 0 &&
                orderForm.prixUnitaire > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Calculé : quantité × prix unitaire
                  </p>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date commande</Label>
                <Input
                  type="date"
                  value={orderForm.dateCommande}
                  onChange={(e) => setOrderForm((p) => ({ ...p, dateCommande: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Livraison souhaitée</Label>
                <Input
                  type="date"
                  value={orderForm.dateLivraisonSouhaitee}
                  onChange={(e) =>
                    setOrderForm((p) => ({ ...p, dateLivraisonSouhaitee: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Statut</Label>
              <Select
                value={orderForm.statut}
                onValueChange={(v) =>
                  setOrderForm((p) => ({ ...p, statut: v as ClientOrderStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_ORDER_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatClientOrderStatusFr(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={orderForm.notes}
                onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <PaymentAtCreationFields
                label="Encaissement client (FAC-CMD)"
                montant={
                  recalcMontant(orderForm.quantite, orderForm.prixUnitaire) ??
                  orderForm.montant ??
                  0
                }
                mode={orderForm.paiementMode}
                onModeChange={(m) => setOrderForm((p) => ({ ...p, paiementMode: m }))}
                montantAvance={orderForm.montantAvance}
                onMontantAvanceChange={(v) =>
                  setOrderForm((p) => ({ ...p, montantAvance: v }))
                }
                datePaiement={orderForm.datePaiement}
                onDatePaiementChange={(v) =>
                  setOrderForm((p) => ({ ...p, datePaiement: v }))
                }
                variant="client"
              />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOrderDialogOpen(false)}>
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

      <Dialog open={loadingDialogOpen} onOpenChange={setLoadingDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créer un bon fournisseur</DialogTitle>
            <DialogDescription className="sr-only">
              Création rapide d&apos;un bon de chargement depuis la commande client.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitLoadingFromClient} className="space-y-3">
            <div>
              <Label>Fournisseur *</Label>
              <ThirdPartyPicker
                options={fournisseurs}
                value={loadingForm.fournisseurId}
                onValueChange={(fournisseurId) =>
                  setLoadingForm((p) =>
                    syncLoadingBonValue(
                      {
                        ...p,
                        fournisseurId,
                        articleId: '',
                        prixUnitaireFournisseur: undefined,
                        montantBonTouched: false,
                      },
                      {},
                    ),
                  )
                }
                placeholder="Choisir un fournisseur"
              />
            </div>
            <div>
              <Label>N° bon</Label>
              <Input
                value={loadingForm.numeroBon}
                onChange={(e) => setLoadingForm((p) => ({ ...p, numeroBon: e.target.value }))}
                placeholder="Ex. BL-001"
              />
            </div>
            <div>
              <Label>Mode d&apos;entrée</Label>
              <Select
                value={loadingForm.modeEntree}
                onValueChange={(v) =>
                  setLoadingForm((p) => ({
                    ...p,
                    modeEntree: v as LoadingEntryMode,
                    camionId: v === 'camion_ansar' ? p.camionId : '',
                    hubArrivee: v === 'rail' ? p.hubArrivee || HUB_PRESETS[0] : HUB_PRESETS[0],
                  }))
                }
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
            {loadingForm.modeEntree === 'camion_ansar' && (
              <div>
                <Label>Camion SIA-ANSAR *</Label>
                <Select
                  value={loadingForm.camionId}
                  onValueChange={(camionId) => setLoadingForm((p) => ({ ...p, camionId }))}
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
                      activeTrucks.map((truck) => (
                        <SelectItem key={truck.id} value={truck.id}>
                          {truck.immatriculation} · {truck.modele}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {loadingForm.modeEntree === 'rail' && (
              <div>
                <Label>Hub CAMRAIL</Label>
                <Select
                  value={(HUB_PRESETS as readonly string[]).includes(loadingForm.hubArrivee) ? loadingForm.hubArrivee : 'Autre hub'}
                  onValueChange={(hubArrivee) =>
                    setLoadingForm((p) => ({
                      ...p,
                      hubArrivee: hubArrivee === 'Autre hub' ? '' : hubArrivee,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HUB_PRESETS.map((hub) => (
                      <SelectItem key={hub} value={hub}>
                        {hub}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!(HUB_PRESETS as readonly string[]).slice(0, -1).includes(loadingForm.hubArrivee) && (
                  <Input
                    className="mt-2"
                    placeholder="Nom du hub"
                    value={loadingForm.hubArrivee}
                    onChange={(e) =>
                      setLoadingForm((p) => ({ ...p, hubArrivee: e.target.value }))
                    }
                  />
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label>Date d&apos;émission du bon *</Label>
                <Input
                  type="date"
                  value={loadingForm.dateChargement}
                  onChange={(e) =>
                    setLoadingForm((p) => ({ ...p, dateChargement: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <Label>Date de livraison</Label>
                <Input
                  type="date"
                  value={loadingForm.dateLivraison}
                  onChange={(e) =>
                    setLoadingForm((p) => ({ ...p, dateLivraison: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Désignation fournisseur</Label>
              <Select
                value={loadingForm.articleId || '_none'}
                disabled={!loadingForm.fournisseurId}
                onValueChange={(articleId) => {
                  if (articleId === '_none') {
                    setLoadingForm((p) =>
                      syncLoadingBonValue(
                        {
                          ...p,
                          articleId: '',
                          prixUnitaireFournisseur: undefined,
                          montantBonTouched: false,
                        },
                        {},
                      ),
                    );
                    return;
                  }
                  const article = articles.find((a) => a.id === articleId);
                  const pu = getArticleSupplierUnitPrice(article, loadingForm.fournisseurId);
                  setLoadingForm((p) =>
                    syncLoadingBonValue(p, {
                      articleId,
                      designation: article?.libelle ?? p.designation,
                      unite: article?.unite || p.unite,
                      prixUnitaireFournisseur: pu,
                      montantBonTouched: false,
                    }),
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingForm.fournisseurId
                        ? 'Choisir une désignation…'
                        : 'Choisir d’abord un fournisseur'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Saisie libre —</SelectItem>
                  {loadingArticlesForFournisseur.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      Aucune désignation tarifée pour ce fournisseur.
                    </div>
                  ) : (
                    loadingArticlesForFournisseur.map((article) => (
                      <SelectItem key={article.id} value={article.id}>
                        {formatArticleSupplierPriceLabel(article, loadingForm.fournisseurId)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                La sélection remplit l’article catalogue, la désignation, l’unité, le prix et la valeur du bon.
              </p>
            </div>
            {loadingForm.modeEntree !== 'rail' && (
              <div>
                <Label>Lieu / site fournisseur</Label>
                {loadingSiteOptions.length > 0 && (
                  <Select
                    value={loadingSiteOptions.includes(loadingForm.lieu) ? loadingForm.lieu : '_manual'}
                    onValueChange={(lieu) =>
                      setLoadingForm((p) => ({
                        ...p,
                        lieu: lieu === '_manual' ? '' : lieu,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un lieu prédéfini" />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingSiteOptions.map((site) => (
                        <SelectItem key={site} value={site}>
                          {site}
                        </SelectItem>
                      ))}
                      <SelectItem value="_manual">Saisie libre</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Input
                  className={loadingSiteOptions.length > 0 ? 'mt-2' : undefined}
                  value={loadingForm.lieu}
                  onChange={(e) => setLoadingForm((p) => ({ ...p, lieu: e.target.value }))}
                  placeholder={
                    loadingSiteOptions.length > 0
                      ? 'Ou saisir un autre lieu'
                      : 'Lieu / site du fournisseur'
                  }
                />
              </div>
            )}
            <div>
              <Label>Désignation *</Label>
              <Input
                value={loadingForm.designation}
                onChange={(e) =>
                  setLoadingForm((p) => ({ ...p, designation: e.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Quantité</Label>
                <NumberInput
                  min={0}
                  value={loadingForm.quantite}
                  onChange={(quantite) =>
                    setLoadingForm((p) =>
                      syncLoadingBonValue(p, { quantite, montantBonTouched: false }),
                    )
                  }
                />
              </div>
              <div>
                <Label>Unité</Label>
                <Input
                  value={loadingForm.unite}
                  onChange={(e) => setLoadingForm((p) => ({ ...p, unite: e.target.value }))}
                  placeholder="sac, t…"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Prix unitaire fournisseur (FCFA)</Label>
                <NumberInput
                  allowEmpty
                  min={0}
                  value={loadingForm.prixUnitaireFournisseur}
                  onChange={(prixUnitaireFournisseur) =>
                    setLoadingForm((p) =>
                      syncLoadingBonValue(p, {
                        prixUnitaireFournisseur,
                        montantBonTouched: false,
                      }),
                    )
                  }
                />
              </div>
              <div>
                <Label>Valeur du bon / montant prévu (FCFA)</Label>
                <NumberInput
                  allowEmpty
                  min={0}
                  value={loadingForm.montantBon}
                  onChange={(montantBon) =>
                    setLoadingForm((p) => ({ ...p, montantBon, montantBonTouched: true }))
                  }
                />
              </div>
            </div>
            {loadingForm.quantite != null &&
              loadingForm.prixUnitaireFournisseur != null &&
              loadingForm.quantite > 0 &&
              loadingForm.prixUnitaireFournisseur > 0 && (
                <p className="text-xs text-muted-foreground -mt-1">
                  Calcul auto : {loadingForm.quantite} ×{' '}
                  {loadingForm.prixUnitaireFournisseur.toLocaleString('fr-FR')} ={' '}
                  {formatFcfa(loadingForm.quantite * loadingForm.prixUnitaireFournisseur)}
                </p>
              )}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={loadingForm.notes}
                onChange={(e) => setLoadingForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLoadingDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Créer et sélectionner
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDelivery ? 'Modifier la livraison' : 'Planifier une livraison'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Planification ou modification d&apos;une livraison client.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitDelivery} className="space-y-3">
            <div>
              <Label>Commande liée *</Label>
              <Select
                value={deliveryForm.clientOrderId || undefined}
                onValueChange={(v) => {
                  const order = orders.find((o) => o.id === v);
                  const linked = findSupplierLoadingForOrder(supplierLoadings, v);
                  const hub = linked?.hubArrivee?.trim() || HUB_PRESETS[0];
                  setDeliveryForm((p) => ({
                    ...p,
                    clientOrderId: v,
                    lieuLivraison: deliveryLieuForExitMode(
                      p.modeSortie,
                      hub,
                      order?.destination ?? defaultDestination ?? '',
                    ),
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {(editingDelivery
                    ? [
                        ...activeOrders,
                        ...orders.filter(
                          (o) =>
                            o.id === editingDelivery.clientOrderId &&
                            !activeOrders.some((a) => a.id === o.id),
                        ),
                      ]
                    : activeOrders
                  ).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.designation} ({o.dateCommande})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mode de sortie</Label>
              <Select
                value={deliveryForm.modeSortie}
                onValueChange={(v) => {
                  const mode = v as ClientDeliveryExitMode;
                  const hub = hubForOrder(deliveryForm.clientOrderId);
                  const order = orders.find((o) => o.id === deliveryForm.clientOrderId);
                  setDeliveryForm((p) => ({
                    ...p,
                    modeSortie: mode,
                    lieuLivraison: deliveryLieuForExitMode(
                      mode,
                      hub,
                      order?.destination ?? defaultDestination ?? '',
                    ),
                    chauffeurId: mode === 'retrait_hub' ? '' : p.chauffeurId,
                    tracteurId: mode === 'retrait_hub' ? '' : p.tracteurId,
                    montantTransport: mode === 'retrait_hub' ? undefined : p.montantTransport,
                    transportFactureParFournisseur:
                      mode === 'retrait_hub' ? false : p.transportFactureParFournisseur,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_EXIT_MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {
                  DELIVERY_EXIT_MODE_OPTIONS.find((o) => o.value === deliveryForm.modeSortie)
                    ?.hint
                }
              </p>
            </div>
            <div>
              <Label>Lieu de livraison *</Label>
              <Input
                value={deliveryForm.lieuLivraison}
                onChange={(e) => setDeliveryForm((p) => ({ ...p, lieuLivraison: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>Date livrée</Label>
              <Input
                type="date"
                value={deliveryForm.dateLivraison}
                onChange={(e) => setDeliveryForm((p) => ({ ...p, dateLivraison: e.target.value }))}
              />
            </div>
            <div>
              <Label>Statut</Label>
              <Select
                value={deliveryForm.statut}
                onValueChange={(v) =>
                  setDeliveryForm((p) => ({ ...p, statut: v as ClientDeliveryStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_DELIVERY_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {formatClientDeliveryStatusFr(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {deliveryForm.modeSortie !== 'retrait_hub' && (
            <>
            <div>
              <Label>Chauffeur</Label>
              <Select
                value={deliveryForm.chauffeurId || '__none__'}
                onValueChange={(v) =>
                  setDeliveryForm((p) => ({
                    ...p,
                    ...linkDriverTruckSelection(
                      activeTrucks,
                      p,
                      'chauffeur',
                      v === '__none__' ? '' : v,
                    ),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optionnel" />
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
              <Label>Camion</Label>
              <Select
                value={deliveryForm.tracteurId || '__none__'}
                onValueChange={(v) =>
                  setDeliveryForm((p) => ({
                    ...p,
                    ...linkDriverTruckSelection(
                      activeTrucks,
                      p,
                      'tracteur',
                      v === '__none__' ? '' : v,
                    ),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optionnel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {activeTrucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.immatriculation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={deliveryForm.transportFactureParFournisseur}
                  onCheckedChange={(c) =>
                    setDeliveryForm((p) => ({
                      ...p,
                      transportFactureParFournisseur: c === true,
                      transportFournisseurId: c === true ? p.transportFournisseurId : '',
                    }))
                  }
                />
                <span className="text-sm font-medium">Transport sous-traité (fournisseur)</span>
              </label>
              {deliveryForm.transportFactureParFournisseur && (
                <>
                  <div className="space-y-2">
                    <Label>Fournisseur qui vous facture le transport *</Label>
                    <ThirdPartyPicker
                      options={fournisseurs}
                      value={deliveryForm.transportFournisseurId}
                      onValueChange={(id) =>
                        setDeliveryForm((p) => ({ ...p, transportFournisseurId: id }))
                      }
                      placeholder="Choisir le fournisseur…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Montant refacturé au client (FCFA)</Label>
                    <NumberInput
                      allowEmpty
                      min={0}
                      value={deliveryForm.montantTransport}
                      onChange={(v) => setDeliveryForm((p) => ({ ...p, montantTransport: v }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Facultatif — inclus sur la FAC-CMD si renseigné et livraison effectuée.</p>                  </div>
                </>
              )}
            </div>
            {!deliveryForm.transportFactureParFournisseur &&
              (deliveryForm.chauffeurId || deliveryForm.tracteurId) && (
                <div className="space-y-2">
                  <Label>Frais transport (FCFA)</Label>
                  <NumberInput
                    allowEmpty
                    min={0}
                    value={deliveryForm.montantTransport}
                    onChange={(v) => setDeliveryForm((p) => ({ ...p, montantTransport: v }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Facultatif — inclus sur la FAC-CMD si renseigné et livraison effectuée.</p>
                </div>
              )}
            </>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={deliveryForm.notes}
                onChange={(e) => setDeliveryForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeliveryDialogOpen(false)}>
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


