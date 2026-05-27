import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useApp, ThirdParty, ThirdPartyType, Invoice } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Edit, Building2, Users, Truck, Search, Filter, X, FileDown, FileText, Loader2, UserCircle2, PanelRight, CreditCard, Briefcase, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import {
  buildSoldeInitialMap,
  exportClientsDetailedExcel,
  exportClientsDetailedPDF,
} from '@/lib/client-export';
import { loadCreditsForPlafond } from '@/lib/client-initial-balance';
import { EMOJI } from '@/lib/emoji-palette';
import { frCollator, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ClientOperationsPanels } from '@/components/clients/ClientOperationsPanels';
import { loadCreditsList } from '@/lib/load-credits-list';
import type { CreditLike } from '@/lib/client-credit-plafond';
import { sumEncoursClientPourPlafond } from '@/lib/client-credit-plafond';
import {
  createClientInitialBalance,
  getClientInitialBalanceMontant,
  loadCreditsForPlafond,
  thirdPartiesToClientTierLike,
  upsertClientInitialBalance,
} from '@/lib/client-initial-balance';
import {
  buildSupplierSummaries,
  formatSupplierEtatFr,
  supplierEtatBadgeVariant,
} from '@/lib/supplier-activity';
import {
  CLIENT_AGE_FILTER_LABELS,
  CLIENT_ENCOURS_FILTER_LABELS,
  CLIENT_ACTIVITY_FILTER_LABELS,
  CLIENT_LIVRAISON_FILTER_LABELS,
  CLIENT_SEGMENT_FILTER_LABELS,
  CLIENT_SEGMENT_OPTIONS,
  CLIENT_SEXE_FILTER_LABELS,
  CLIENT_SEXE_OPTIONS,
  EMPTY_CLIENT_FILTERS,
  collectClientVilles,
  formatClientSegmentFr,
  formatClientSexeFr,
  getClientAgeYears,
  getEncoursClient,
  hasActiveClientFilters,
  matchesClientAdvancedFilters,
  type ClientFilterState,
  type ClientSexe,
  type ClientSegment,
} from '@/lib/client-profile';

const THIRD_SORT_OPTIONS = [
  { value: 'nom_asc', label: 'Nom A → Z' },
  { value: 'nom_desc', label: 'Nom Z → A' },
  { value: 'type_asc', label: 'Type (propriétaire → fournisseur)' },
  { value: 'type_desc', label: 'Type (fournisseur → propriétaire)' },
] as const;

const CLIENT_SORT_OPTIONS = [
  { value: 'nom_asc', label: 'Nom A → Z' },
  { value: 'nom_desc', label: 'Nom Z → A' },
  { value: 'plafond_desc', label: 'Plafond encours (du plus haut)' },
  { value: 'plafond_asc', label: 'Plafond encours (du plus bas, sans plafond en dernier)' },
] as const;

type ClientPlafondFilter = 'all' | 'defined' | 'none';
type ClientOrderFilter = 'all' | 'yes' | 'no';
type ClientContactFilter =
  | 'all'
  | 'phone_set'
  | 'phone_missing'
  | 'email_set'
  | 'email_missing'
  | 'coords_incomplete';

const typeOrder = (t: string) =>
  t === 'proprietaire' ? 0 : t === 'client' ? 1 : t === 'fournisseur' ? 2 : t === 'employe' ? 3 : 9;

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

function invoiceStatutLabel(s: Invoice['statut']): string {
  return s === 'payee' ? 'Payée' : 'En attente';
}

export type ThirdPartiesScope = 'all' | 'clients';

export default function ThirdParties({ scope = 'all' }: { scope?: ThirdPartiesScope }) {
  const isClientsScope = scope === 'clients';
  const {
    thirdParties,
    trucks,
    invoices,
    expenses,
    clientOrders,
    clientDeliveries,
    supplierLoadings,
    articles,
    createThirdParty,
    updateThirdParty,
    deleteThirdParty,
    refreshClientOrders,
    refreshClientDeliveries,
  } = useApp();
  const { canManageFleet } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingThirdParty, setEditingThirdParty] = useState<ThirdParty | null>(null);
  const { isSubmitting, withGuard } = useSubmitGuard();
  const [filterType, setFilterType] = useState<ThirdPartyType | 'all'>(() =>
    scope === 'clients' ? 'client' : 'all',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [listSort, setListSort] = useState<string>('nom_asc');
  const [clientFilterPlafond, setClientFilterPlafond] = useState<ClientPlafondFilter>('all');
  const [clientFilterOrder, setClientFilterOrder] = useState<ClientOrderFilter>('all');
  const [clientFilterContact, setClientFilterContact] = useState<ClientContactFilter>('all');
  const [clientAdvancedFilters, setClientAdvancedFilters] =
    useState<ClientFilterState>(EMPTY_CLIENT_FILTERS);
  const [detailClient, setDetailClient] = useState<ThirdParty | null>(null);
  const [creditsForPlafondSheet, setCreditsForPlafondSheet] = useState<CreditLike[]>([]);
  const [detailSoldeInitial, setDetailSoldeInitial] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    nom: '',
    telephone: '',
    email: '',
    adresse: '',
    type: 'proprietaire' as ThirdPartyType,
    notes: '',
    plafondCredit: '' as number | '',
    soldeInitial: '' as number | '',
    sexe: '' as ClientSexe | '',
    segmentClient: '' as ClientSegment | '',
    ville: '',
    dateNaissance: '',
  });

  const resetClientFilters = () => {
    setClientFilterPlafond('all');
    setClientFilterOrder('all');
    setClientFilterContact('all');
    setClientAdvancedFilters(EMPTY_CLIENT_FILTERS);
  };

  const resetForm = () => {
    setFormData({
      nom: '',
      telephone: '',
      email: '',
      adresse: '',
      type: scope === 'clients' ? 'client' : 'proprietaire',
      notes: '',
      plafondCredit: '',
      soldeInitial: '',
      sexe: '',
      segmentClient: '',
      ville: '',
      dateNaissance: '',
    });
    setEditingThirdParty(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nom.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    await withGuard(async () => {
      try {
        const effectiveType = (isClientsScope ? 'client' : formData.type) as ThirdPartyType;
        const payload = {
          nom: formData.nom.trim(),
          telephone: formData.telephone || undefined,
          email: formData.email || undefined,
          adresse: formData.adresse || undefined,
          type: effectiveType,
          notes: formData.notes || undefined,
          ...(effectiveType === 'client'
            ? {
                plafondCredit:
                  formData.plafondCredit === '' || formData.plafondCredit == null
                    ? null
                    : Math.max(0, Math.round(Number(formData.plafondCredit))),
                sexe: formData.sexe || null,
                segmentClient: formData.segmentClient || null,
                ville: formData.ville.trim() || null,
                dateNaissance: formData.dateNaissance || null,
              }
            : editingThirdParty
              ? {
                  plafondCredit: null,
                  sexe: null,
                  segmentClient: null,
                  ville: null,
                  dateNaissance: null,
                }
              : {}),
        };

        if (editingThirdParty) {
          await updateThirdParty(editingThirdParty.id, payload);
          if (effectiveType === 'client') {
            const soldeInit =
              formData.soldeInitial === '' || formData.soldeInitial == null
                ? 0
                : Math.round(Number(formData.soldeInitial));
            const credits = await loadCreditsForPlafond();
            const tiersForPlafond = thirdPartiesToClientTierLike(thirdParties);
            await upsertClientInitialBalance({
              clientId: editingThirdParty.id,
              clientNom: payload.nom,
              montant: soldeInit,
              credits,
              thirdParties: tiersForPlafond,
              invoices,
            });
            if (detailClient?.id === editingThirdParty.id) {
              const list = await loadCreditsList();
              setCreditsForPlafondSheet(list);
            }
          }
          const soldeEditMsg =
            effectiveType === 'client'
              ? (() => {
                  const v =
                    formData.soldeInitial === '' || formData.soldeInitial == null
                      ? 0
                      : Math.round(Number(formData.soldeInitial));
                  return v > 0
                    ? ` Solde initial : ${v.toLocaleString('fr-FR')} FCFA.`
                    : ' Solde initial retiré.';
                })()
              : '';
          toast.success(
            (isClientsScope ? 'Client modifié avec succès' : 'Tier modifié avec succès') + soldeEditMsg,
          );
        } else {
          const created = await createThirdParty(payload);
          const soldeInit =
            formData.soldeInitial === '' || formData.soldeInitial == null
              ? 0
              : Math.round(Number(formData.soldeInitial));

          if (effectiveType === 'client' && soldeInit > 0) {
            const credits = await loadCreditsForPlafond();
            const tiersForPlafond = thirdPartiesToClientTierLike([
              ...thirdParties.filter((tp) => tp.id !== created.id),
              created,
            ]);
            await createClientInitialBalance({
              clientId: created.id,
              clientNom: created.nom,
              montant: soldeInit,
              credits,
              thirdParties: tiersForPlafond,
              invoices,
            });
          }

          const clientListFiltersActive =
            isClientsScope && (searchTerm.trim() !== '' || anyClientFilterActive);
          const detteMsg =
            effectiveType === 'client' && soldeInit > 0
              ? ` Dette initiale : ${soldeInit.toLocaleString('fr-FR')} FCFA (comptée dans l'encours).`
              : '';
          toast.success(
            (isClientsScope
              ? clientListFiltersActive
                ? "Client ajouté. Si la fiche n'apparaît pas, les filtres actifs peuvent la masquer — cliquez sur « Réinitialiser »."
                : 'Client ajouté avec succès'
              : 'Tier ajouté avec succès') + detteMsg,
          );
        }
        setIsDialogOpen(false);
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      }
    });
  };

  const handleEdit = async (thirdParty: ThirdParty) => {
    setEditingThirdParty(thirdParty);
    let soldeInitial: number | '' = '';
    if (thirdParty.type === 'client') {
      try {
        const m = await getClientInitialBalanceMontant(thirdParty.id, thirdParty.nom);
        soldeInitial = m > 0 ? m : '';
      } catch {
        soldeInitial = '';
      }
    }
    setFormData({
      nom: thirdParty.nom,
      telephone: thirdParty.telephone || '',
      email: thirdParty.email || '',
      adresse: thirdParty.adresse || '',
      type: thirdParty.type,
      notes: thirdParty.notes || '',
      plafondCredit: thirdParty.plafondCredit != null ? Math.round(thirdParty.plafondCredit) : '',
      soldeInitial,
      sexe: thirdParty.sexe ?? '',
      segmentClient: thirdParty.segmentClient ?? '',
      ville: thirdParty.ville ?? '',
      dateNaissance: thirdParty.dateNaissance ?? '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const thirdParty = thirdParties.find(tp => tp.id === id);
    if (!thirdParty) return;

    if (thirdParty.type === 'proprietaire') {
      const trucksUsingOwner = trucks.filter(t => t.proprietaireId === id);
      if (trucksUsingOwner.length > 0) {
        toast.error(`Impossible de supprimer ce propriétaire : ${trucksUsingOwner.length} camion(s) lui sont associés`);
        return;
      }
    }

    if (thirdParty.type === 'employe') {
      const depensesLiees = expenses.filter((e) => e.fournisseurId === id);
      if (depensesLiees.length > 0) {
        toast.error(
          `Impossible de supprimer ce personnel : ${depensesLiees.length} dépense(s) y sont liées (salaires ou factures fournisseur). Retirez d'abord le lien sur les dépenses.`,
        );
        return;
      }
    }

    if (confirm(`Êtes-vous sûr de vouloir supprimer ${thirdParty.nom} ?`)) {
      try {
        await deleteThirdParty(id);
        toast.success('Tier supprimé');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
      }
    }
  };

  const clientHasOrderLink = (tp: ThirdParty) =>
    tp.type === 'client' && clientOrders.some((o) => o.clientId === tp.id);

  useEffect(() => {
    if (detailClient?.type === 'client') {
      void refreshClientOrders(detailClient.id);
      void refreshClientDeliveries(detailClient.id);
    }
  }, [detailClient?.id, detailClient?.type, refreshClientOrders, refreshClientDeliveries]);

  const filteredThirdParties = thirdParties.filter((tp) => {
    if (filterType !== 'all' && tp.type !== filterType) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchSearch =
        tp.nom.toLowerCase().includes(search) ||
        (tp.telephone && tp.telephone.includes(search)) ||
        (tp.email && tp.email.toLowerCase().includes(search)) ||
        (tp.adresse && tp.adresse.toLowerCase().includes(search)) ||
        (tp.notes && tp.notes.toLowerCase().includes(search)) ||
        (tp.ville && tp.ville.toLowerCase().includes(search)) ||
        (tp.plafondCredit != null &&
          String(Math.round(tp.plafondCredit)).includes(search.replace(/\s/g, '')));
      if (!matchSearch) return false;
    }
    if (isClientsScope && tp.type === 'client') {
      if (
        !matchesClientAdvancedFilters(tp, clientAdvancedFilters, {
          invoices,
          credits: creditsForPlafondSheet,
          clientOrders,
          clientDeliveries,
        })
      ) {
        return false;
      }
      const hasPlafond = tp.plafondCredit != null && Number.isFinite(tp.plafondCredit);
      if (clientFilterPlafond === 'defined' && !hasPlafond) return false;
      if (clientFilterPlafond === 'none' && hasPlafond) return false;
      if (clientFilterOrder === 'yes' && !clientHasOrderLink(tp)) return false;
      if (clientFilterOrder === 'no' && clientHasOrderLink(tp)) return false;
      const tel = (tp.telephone ?? '').trim();
      const em = (tp.email ?? '').trim();
      const adr = (tp.adresse ?? '').trim();
      if (clientFilterContact === 'phone_set' && !tel) return false;
      if (clientFilterContact === 'phone_missing' && tel) return false;
      if (clientFilterContact === 'email_set' && !em) return false;
      if (clientFilterContact === 'email_missing' && em) return false;
      if (clientFilterContact === 'coords_incomplete' && tel && em && adr) return false;
    }
    return true;
  });

  const sortedThirdParties = useMemo(() => {
    const list = [...filteredThirdParties];
    switch (listSort) {
      case 'nom_desc':
        return stableSort(list, (a, b) => frCollator.compare(b.nom, a.nom));
      case 'type_asc':
        return stableSort(list, (a, b) => typeOrder(a.type) - typeOrder(b.type) || frCollator.compare(a.nom, b.nom));
      case 'type_desc':
        return stableSort(list, (a, b) => typeOrder(b.type) - typeOrder(a.type) || frCollator.compare(a.nom, b.nom));
      case 'plafond_desc':
        return stableSort(list, (a, b) => {
          const pa = a.type === 'client' && a.plafondCredit != null ? a.plafondCredit : -1;
          const pb = b.type === 'client' && b.plafondCredit != null ? b.plafondCredit : -1;
          return pb - pa || frCollator.compare(a.nom, b.nom);
        });
      case 'plafond_asc':
        return stableSort(list, (a, b) => {
          const pa =
            a.type === 'client' && a.plafondCredit != null && Number.isFinite(a.plafondCredit)
              ? a.plafondCredit
              : Number.POSITIVE_INFINITY;
          const pb =
            b.type === 'client' && b.plafondCredit != null && Number.isFinite(b.plafondCredit)
              ? b.plafondCredit
              : Number.POSITIVE_INFINITY;
          return pa - pb || frCollator.compare(a.nom, b.nom);
        });
      case 'nom_asc':
      default:
        return stableSort(list, (a, b) => frCollator.compare(a.nom, b.nom));
    }
  }, [filteredThirdParties, listSort]);

  const getTypeIcon = (type: ThirdPartyType) => {
    switch (type) {
      case 'proprietaire':
        return <Truck className="h-4 w-4" />;
      case 'client':
        return <Users className="h-4 w-4" />;
      case 'fournisseur':
        return <Building2 className="h-4 w-4" />;
      case 'employe':
        return <Briefcase className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: ThirdPartyType) => {
    switch (type) {
      case 'proprietaire':
        return 'Propriétaire';
      case 'client':
        return 'Client';
      case 'fournisseur':
        return 'Fournisseur';
      case 'employe':
        return 'Personnel siège';
    }
  };

  const getTypeColor = (type: ThirdPartyType) => {
    switch (type) {
      case 'proprietaire':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
      case 'client':
        return 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400';
      case 'fournisseur':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400';
      case 'employe':
        return 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300';
    }
  };

  const proprietairesCount = thirdParties.filter(tp => tp.type === 'proprietaire').length;
  const clientsCount = thirdParties.filter(tp => tp.type === 'client').length;
  const fournisseursCount = thirdParties.filter(tp => tp.type === 'fournisseur').length;

  const supplierSummaryById = useMemo(() => {
    const fournisseurs = thirdParties.filter((tp) => tp.type === 'fournisseur');
    const list = buildSupplierSummaries({
      fournisseurs,
      supplierLoadings,
      expenses,
      clientDeliveries,
      articles,
    });
    return new Map(list.map((s) => [s.fournisseurId, s]));
  }, [thirdParties, supplierLoadings, expenses, clientDeliveries, articles]);
  const employesCount = thirdParties.filter((tp) => tp.type === 'employe').length;

  const clientTiers = useMemo(
    () => thirdParties.filter((tp) => tp.type === 'client'),
    [thirdParties],
  );

  const clientVilles = useMemo(() => collectClientVilles(clientTiers), [clientTiers]);

  useEffect(() => {
    if (!isClientsScope) return;
    let cancelled = false;
    loadCreditsForPlafond().then((list) => {
      if (!cancelled) setCreditsForPlafondSheet(list);
    });
    return () => {
      cancelled = true;
    };
  }, [isClientsScope]);

  const clientsWithOrders = useMemo(() => {
    const ids = new Set(clientOrders.map((o) => o.clientId));
    return ids.size;
  }, [clientOrders]);

  useEffect(() => {
    if (!detailClient || detailClient.type !== 'client') {
      setCreditsForPlafondSheet([]);
      setDetailSoldeInitial(null);
      return;
    }
    let cancelled = false;
    loadCreditsList().then((list) => {
      if (!cancelled) setCreditsForPlafondSheet(list);
    });
    getClientInitialBalanceMontant(detailClient.id, detailClient.nom).then((m) => {
      if (!cancelled) setDetailSoldeInitial(m);
    });
    return () => {
      cancelled = true;
    };
  }, [detailClient?.id, detailClient?.type, detailClient?.nom]);

  const encoursFicheClient = useMemo(() => {
    if (!detailClient || detailClient.type !== 'client') {
      return { total: 0, factures: 0, credits: 0 };
    }
    return sumEncoursClientPourPlafond({
      credits: creditsForPlafondSheet,
      client: { id: detailClient.id, nom: detailClient.nom },
      invoices,
    });
  }, [detailClient, creditsForPlafondSheet, invoices]);

  const listSortOptions = useMemo(
    () => (isClientsScope ? [...CLIENT_SORT_OPTIONS] : [...THIRD_SORT_OPTIONS]),
    [isClientsScope],
  );

  const clientPlafondFilterLabel: Record<ClientPlafondFilter, string> = {
    all: '',
    defined: 'Plafond encours défini',
    none: 'Sans plafond encours',
  };
  const clientOrderFilterLabel: Record<ClientOrderFilter, string> = {
    all: '',
    yes: 'Au moins une commande',
    no: 'Sans commande',
  };
  const clientContactFilterLabel: Record<ClientContactFilter, string> = {
    all: '',
    phone_set: 'Téléphone renseigné',
    phone_missing: 'Téléphone absent',
    email_set: 'Email renseigné',
    email_missing: 'Email absent',
    coords_incomplete: 'Coordonnées incomplètes (tél., email ou adresse manquant)',
  };

  const anyClientFilterActive =
    clientFilterPlafond !== 'all' ||
    clientFilterOrder !== 'all' ||
    clientFilterContact !== 'all' ||
    hasActiveClientFilters(clientAdvancedFilters);

  const getFiltersDescription = () => {
    const filters: string[] = [];
    if (searchTerm) filters.push(`Recherche: "${searchTerm}"`);
    if (isClientsScope) {
      filters.push('Vue clients');
      if (clientFilterPlafond !== 'all') filters.push(clientPlafondFilterLabel[clientFilterPlafond]);
      if (clientFilterOrder !== 'all') filters.push(clientOrderFilterLabel[clientFilterOrder]);
      if (clientFilterContact !== 'all') filters.push(clientContactFilterLabel[clientFilterContact]);
      if (clientAdvancedFilters.sexe !== 'all')
        filters.push(CLIENT_SEXE_FILTER_LABELS[clientAdvancedFilters.sexe]);
      if (clientAdvancedFilters.segment !== 'all')
        filters.push(CLIENT_SEGMENT_FILTER_LABELS[clientAdvancedFilters.segment]);
      if (clientAdvancedFilters.ville !== 'all')
        filters.push(`Ville: ${clientAdvancedFilters.ville}`);
      if (clientAdvancedFilters.age !== 'all')
        filters.push(CLIENT_AGE_FILTER_LABELS[clientAdvancedFilters.age]);
      if (clientAdvancedFilters.encours !== 'all')
        filters.push(CLIENT_ENCOURS_FILTER_LABELS[clientAdvancedFilters.encours]);
      if (clientAdvancedFilters.activity !== 'all')
        filters.push(CLIENT_ACTIVITY_FILTER_LABELS[clientAdvancedFilters.activity]);
      if (clientAdvancedFilters.livraison !== 'all')
        filters.push(CLIENT_LIVRAISON_FILTER_LABELS[clientAdvancedFilters.livraison]);
    } else if (filterType !== 'all') filters.push(`Type: ${getTypeLabel(filterType)}`);
    const sortLabel = listSortOptions.find((o) => o.value === listSort)?.label;
    if (sortLabel) filters.push(`Tri: ${sortLabel}`);
    return filters.length > 0 ? `Filtres appliqués: ${filters.join(', ')}` : sortLabel ? `Tri: ${sortLabel}` : undefined;
  };

  const buildClientsExportContext = async () => {
    const clients = sortedThirdParties.filter((tp) => tp.type === 'client');
    const credits =
      creditsForPlafondSheet.length > 0
        ? creditsForPlafondSheet
        : await loadCreditsForPlafond();
    const soldeInitialByClientId = await buildSoldeInitialMap(clients);
    return {
      clients,
      clientOrders,
      clientDeliveries,
      invoices,
      supplierLoadings,
      trucks,
      credits,
      soldeInitialByClientId,
      filtersDescription: getFiltersDescription(),
    };
  };

  const handleExportExcel = () => {
    if (isClientsScope) {
      void withGuard(async () => {
        const ctx = await buildClientsExportContext();
        exportClientsDetailedExcel(ctx);
        toast.success('Export Excel détaillé généré avec succès');
      });
      return;
    }
    const exportTitle = 'Liste des Tiers';
    exportToExcel({
      title: exportTitle,
      fileName: `tiers_${new Date().toISOString().split('T')[0]}.xlsx`,
      filtersDescription: getFiltersDescription(),
      columns: [
        { header: 'Nom', value: (tp) => tp.nom },
        { header: 'Type', value: (tp) => getTypeLabel(tp.type) },
        { header: 'Téléphone', value: (tp) => tp.telephone || '-' },
        { header: 'Email', value: (tp) => tp.email || '-' },
        { header: 'Adresse', value: (tp) => tp.adresse || '-' },
        { header: 'Plafond encours clients (FCFA)', value: (tp) => (tp.type === 'client' && tp.plafondCredit != null ? String(Math.round(tp.plafondCredit)) : '—') },
        { header: 'Notes', value: (tp) => tp.notes || '-' },
      ],
      rows: sortedThirdParties,
    });
    toast.success('Export Excel généré avec succès');
  };

  const handleExportPDF = () => {
    if (isClientsScope) {
      void withGuard(async () => {
        const ctx = await buildClientsExportContext();
        exportClientsDetailedPDF(ctx, [
          { label: 'Clients exportés', value: ctx.clients.length, style: 'positive', icon: '👥' },
          { label: 'Clients avec commandes', value: clientsWithOrders, style: 'neutral', icon: EMOJI.liste },
        ]);
        toast.success('Export PDF détaillé généré — utilisez « Enregistrer en PDF » dans la fenêtre d’impression');
      });
      return;
    }
    const totalProprietaires = filteredThirdParties.filter((tp) => tp.type === 'proprietaire').length;
    const totalClients = filteredThirdParties.filter((tp) => tp.type === 'client').length;
    const totalFournisseurs = filteredThirdParties.filter((tp) => tp.type === 'fournisseur').length;
    const totalEmployes = filteredThirdParties.filter((tp) => tp.type === 'employe').length;
    const exportTitle = 'Liste des Tiers';
    const headerColor = '#4f46e5';

    exportToPrintablePDF({
      title: exportTitle,
      fileName: `tiers_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: getFiltersDescription(),
      headerColor,
      headerTextColor: '#ffffff',
      evenRowColor: '#eef2ff',
      oddRowColor: '#ffffff',
      accentColor: headerColor,
      totals: [
            { label: 'Total Tiers', value: filteredThirdParties.length, style: 'neutral', icon: EMOJI.liste },
            { label: 'Propriétaires', value: totalProprietaires, style: 'neutral', icon: '🏢' },
            { label: 'Clients', value: totalClients, style: 'positive', icon: '👥' },
            { label: 'Fournisseurs', value: totalFournisseurs, style: 'neutral', icon: '🏢' },
            { label: 'Personnel siège', value: totalEmployes, style: 'neutral', icon: '👔' },
      ],
      columns: [
        { header: 'Nom', value: (tp) => tp.nom },
        { header: 'Type', value: (tp) => {
          const icons: Record<string, string> = {
            'proprietaire': '🏢',
            'client': '👥',
            'fournisseur': '🏢',
            employe: '👔',
          };
          return `${icons[tp.type] || '🏷️'} ${getTypeLabel(tp.type)}`;
        }},
        { header: 'Téléphone', value: (tp) => tp.telephone ? `${EMOJI.telephone} ${tp.telephone}` : '-' },
        { header: 'Email', value: (tp) => tp.email ? `${EMOJI.email} ${tp.email}` : '-' },
        { header: 'Adresse', value: (tp) => tp.adresse ? `${EMOJI.adresse} ${tp.adresse}` : '-' },
        { header: 'Plafond encours', value: (tp) => (tp.type === 'client' && tp.plafondCredit != null ? `${Math.round(tp.plafondCredit)} F` : '—') },
      ],
      rows: sortedThirdParties,
    });
  };

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title={isClientsScope ? 'Clients' : 'Gestion des Tiers'}
        icon={isClientsScope ? UserCircle2 : Building2}
        gradient={
          isClientsScope
            ? 'from-emerald-500/15 via-teal-500/10 to-transparent'
            : 'from-indigo-500/20 via-purple-500/10 to-transparent'
        }
        stats={
          isClientsScope
            ? [
                {
                  label: 'Fiches client',
                  value: clientsCount,
                  icon: <UserCircle2 className="h-4 w-4" />,
                  color: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  label: 'Clients avec commandes',
                  value: clientsWithOrders,
                  icon: <ClipboardList className="h-4 w-4" />,
                  color: 'text-teal-600 dark:text-teal-400',
                },
              ]
            : [
                {
                  label: 'Propriétaires',
                  value: proprietairesCount,
                  icon: <Truck className="h-4 w-4" />,
                  color: 'text-blue-600 dark:text-blue-400',
                },
                {
                  label: 'Clients',
                  value: clientsCount,
                  icon: <Users className="h-4 w-4" />,
                  color: 'text-green-600 dark:text-green-400',
                },
                {
                  label: 'Fournisseurs',
                  value: fournisseursCount,
                  icon: <Building2 className="h-4 w-4" />,
                  color: 'text-orange-600 dark:text-orange-400',
                },
                {
                  label: 'Personnel siège',
                  value: employesCount,
                  icon: <Briefcase className="h-4 w-4" />,
                  color: 'text-violet-600 dark:text-violet-400',
                },
                {
                  label: 'Total',
                  value: thirdParties.length,
                  icon: <Building2 className="h-4 w-4" />,
                  color: 'text-purple-600 dark:text-purple-400',
                },
              ]
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="shadow-md hover:shadow-lg transition-all duration-300">
              <FileDown className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF} className="shadow-md hover:shadow-lg transition-all duration-300">
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              {canManageFleet && (
              <DialogTrigger asChild>
                <Button onClick={() => setIsDialogOpen(true)} className="shadow-md hover:shadow-lg transition-all duration-300">
                  <Plus className="mr-2 h-4 w-4" />
                  {isClientsScope ? 'Nouveau client' : 'Ajouter un tier'}
                </Button>
              </DialogTrigger>
              )}
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingThirdParty
                    ? isClientsScope
                      ? 'Modifier le client'
                      : 'Modifier le tier'
                    : isClientsScope
                      ? 'Nouveau client'
                      : 'Ajouter un tier'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!isClientsScope && (
                <div>
                  <Label htmlFor="type">Type *</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(value) => setFormData({ ...formData, type: value as ThirdPartyType })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="proprietaire">Propriétaire de camion</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="fournisseur">Fournisseur (chargements, achats site)</SelectItem>
                      <SelectItem value="employe">Personnel siège (salaires, hors chauffeurs)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                )}

                <div>
                  <Label htmlFor="nom">Nom / Raison sociale *</Label>
                  <Input
                    id="nom"
                    value={formData.nom}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    placeholder="Nom complet ou raison sociale"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="telephone">Téléphone</Label>
                    <Input
                      id="telephone"
                      value={formData.telephone}
                      onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                      placeholder="+237 6 12 34 56 78"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="exemple@email.com"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="adresse">Adresse</Label>
                  <Input
                    id="adresse"
                    value={formData.adresse}
                    onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                    placeholder="Adresse complète"
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Informations complémentaires..."
                    rows={3}
                  />
                </div>

                {(formData.type === 'client' || isClientsScope) && (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <p className="text-sm font-medium">Profil client</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Sexe</Label>
                        <Select
                          value={formData.sexe || '_none'}
                          onValueChange={(v) =>
                            setFormData({
                              ...formData,
                              sexe: v === '_none' ? '' : (v as ClientSexe),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Non renseigné" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Non renseigné</SelectItem>
                            {CLIENT_SEXE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Segment</Label>
                        <Select
                          value={formData.segmentClient || '_none'}
                          onValueChange={(v) =>
                            setFormData({
                              ...formData,
                              segmentClient: v === '_none' ? '' : (v as ClientSegment),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Non renseigné" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Non renseigné</SelectItem>
                            {CLIENT_SEGMENT_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ville-client">Ville / quartier</Label>
                        <Input
                          id="ville-client"
                          value={formData.ville}
                          onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                          placeholder="Ex. Douala, Akwa…"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="date-naissance">Date de naissance</Label>
                        <Input
                          id="date-naissance"
                          type="date"
                          value={formData.dateNaissance}
                          onChange={(e) =>
                            setFormData({ ...formData, dateNaissance: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(formData.type === 'client' || isClientsScope) && (
                  <div className="space-y-2">
                    <Label htmlFor="solde-initial">Dette / solde initial dû (FCFA)</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      {editingThirdParty
                        ? "Modifiez le montant dû à l'ouverture. Vide ou 0 pour retirer, sauf si déjà partiellement soldé via factures."
                        : "Montant que le client vous doit déjà à l'ouverture (hors futures commandes). Compté dans l'encours client."}
                    </p>
                    <Input
                      id="solde-initial"
                      type="number"
                      min={0}
                      step={1}
                      className="mt-1"
                      value={formData.soldeInitial === '' ? '' : formData.soldeInitial}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') setFormData({ ...formData, soldeInitial: '' });
                        else {
                          const n = Math.round(Number(v));
                          setFormData({
                            ...formData,
                            soldeInitial: Number.isFinite(n) && n >= 0 ? n : '',
                          });
                        }
                      }}
                      placeholder="Ex. 500 000 — vide si aucune dette"
                    />
                  </div>
                )}

                {(formData.type === 'client' || isClientsScope) && (
                  <div>
                    <Label htmlFor="plafond-credit">Plafond encours clients (« commandes non payées ») (FCFA)</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Montant maximal cumulé autorisé (factures impayées + solde initial). Vide = pas de limite.
                    </p>
                    <Input
                      id="plafond-credit"
                      type="number"
                      min={0}
                      step={1}
                      className="mt-1"
                      value={formData.plafondCredit === '' ? '' : formData.plafondCredit}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '') setFormData({ ...formData, plafondCredit: '' });
                        else {
                          const n = Math.round(Number(v));
                          setFormData({
                            ...formData,
                            plafondCredit: Number.isFinite(n) && n >= 0 ? n : '',
                          });
                        }
                      }}
                      placeholder="Ex. 10 000 000"
                    />
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</> : (editingThirdParty ? 'Modifier' : (isClientsScope ? 'Enregistrer le client' : 'Ajouter'))}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtres de recherche
            </CardTitle>
            {(searchTerm ||
              (!isClientsScope && filterType !== 'all') ||
              (isClientsScope && anyClientFilterActive)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setListSort('nom_asc');
                  if (!isClientsScope) setFilterType('all');
                  else {
                    setFilterType('client');
                    resetClientFilters();
                  }
                }}
                className="text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isClientsScope ? (
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1">
                <span>Propriétaires et fournisseurs se gèrent depuis</span>
                <Link to="/tiers" className="text-primary font-medium underline-offset-4 hover:underline">
                  Tiers
                </Link>
                <span>.</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1">
                <span>Vue centrée sur les clients :</span>
                <Link to="/clients" className="text-primary font-medium underline-offset-4 hover:underline">
                  Clients
                </Link>
              </p>
            )}
            {/* Recherche générale */}
            <div>
              <Label htmlFor="search-third-parties" className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Search className="h-4 w-4" />
                Recherche générale
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-third-parties"
                  placeholder={
                    isClientsScope
                      ? 'Nom, téléphone, email, ville, adresse, notes ou plafond…'
                      : 'Nom, téléphone, email, adresse ou notes…'
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Filtres actifs */}
            {!isClientsScope && filterType !== 'all' && (
              <div className="flex flex-wrap gap-2 pb-2">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  {getTypeLabel(filterType)}
                  <button
                    onClick={() => setFilterType('all')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre type"
                    title="Retirer le filtre type"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </div>
            )}

            {isClientsScope && anyClientFilterActive && (
                <div className="flex flex-wrap gap-2 pb-2">
                  {clientFilterPlafond !== 'all' && (
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20 px-3 py-1.5">
                      {clientPlafondFilterLabel[clientFilterPlafond]}
                      <button
                        type="button"
                        onClick={() => setClientFilterPlafond('all')}
                        className="ml-2 hover:bg-emerald-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre plafond"
                        title="Retirer le filtre plafond"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientFilterOrder !== 'all' && (
                    <Badge variant="secondary" className="bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/20 px-3 py-1.5">
                      {clientOrderFilterLabel[clientFilterOrder]}
                      <button
                        type="button"
                        onClick={() => setClientFilterOrder('all')}
                        className="ml-2 hover:bg-teal-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre commandes"
                        title="Retirer le filtre commandes"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientFilterContact !== 'all' && (
                    <Badge variant="secondary" className="bg-slate-500/10 text-slate-800 dark:text-slate-300 border-slate-500/20 px-3 py-1.5">
                      {clientContactFilterLabel[clientFilterContact]}
                      <button
                        type="button"
                        onClick={() => setClientFilterContact('all')}
                        className="ml-2 hover:bg-slate-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre coordonnées"
                        title="Retirer le filtre coordonnées"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientAdvancedFilters.sexe !== 'all' && (
                    <Badge variant="secondary" className="bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/20 px-3 py-1.5">
                      {CLIENT_SEXE_FILTER_LABELS[clientAdvancedFilters.sexe]}
                      <button
                        type="button"
                        onClick={() =>
                          setClientAdvancedFilters((f) => ({ ...f, sexe: 'all' }))
                        }
                        className="ml-2 hover:bg-violet-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre sexe"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientAdvancedFilters.segment !== 'all' && (
                    <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-500/20 px-3 py-1.5">
                      {CLIENT_SEGMENT_FILTER_LABELS[clientAdvancedFilters.segment]}
                      <button
                        type="button"
                        onClick={() =>
                          setClientAdvancedFilters((f) => ({ ...f, segment: 'all' }))
                        }
                        className="ml-2 hover:bg-indigo-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre segment"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientAdvancedFilters.ville !== 'all' && (
                    <Badge variant="secondary" className="bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/20 px-3 py-1.5">
                      Ville : {clientAdvancedFilters.ville}
                      <button
                        type="button"
                        onClick={() =>
                          setClientAdvancedFilters((f) => ({ ...f, ville: 'all' }))
                        }
                        className="ml-2 hover:bg-sky-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre ville"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientAdvancedFilters.age !== 'all' && (
                    <Badge variant="secondary" className="bg-pink-500/10 text-pink-800 dark:text-pink-300 border-pink-500/20 px-3 py-1.5">
                      {CLIENT_AGE_FILTER_LABELS[clientAdvancedFilters.age]}
                      <button
                        type="button"
                        onClick={() =>
                          setClientAdvancedFilters((f) => ({ ...f, age: 'all' }))
                        }
                        className="ml-2 hover:bg-pink-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre âge"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientAdvancedFilters.encours !== 'all' && (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-900 dark:text-amber-300 border-amber-500/20 px-3 py-1.5">
                      {CLIENT_ENCOURS_FILTER_LABELS[clientAdvancedFilters.encours]}
                      <button
                        type="button"
                        onClick={() =>
                          setClientAdvancedFilters((f) => ({ ...f, encours: 'all' }))
                        }
                        className="ml-2 hover:bg-amber-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre encours"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientAdvancedFilters.activity !== 'all' && (
                    <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-900 dark:text-cyan-300 border-cyan-500/20 px-3 py-1.5">
                      {CLIENT_ACTIVITY_FILTER_LABELS[clientAdvancedFilters.activity]}
                      <button
                        type="button"
                        onClick={() =>
                          setClientAdvancedFilters((f) => ({ ...f, activity: 'all' }))
                        }
                        className="ml-2 hover:bg-cyan-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre activité"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientAdvancedFilters.livraison !== 'all' && (
                    <Badge variant="secondary" className="bg-lime-500/10 text-lime-900 dark:text-lime-300 border-lime-500/20 px-3 py-1.5">
                      {CLIENT_LIVRAISON_FILTER_LABELS[clientAdvancedFilters.livraison]}
                      <button
                        type="button"
                        onClick={() =>
                          setClientAdvancedFilters((f) => ({ ...f, livraison: 'all' }))
                        }
                        className="ml-2 hover:bg-lime-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre livraison"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}

            {/* Sélecteurs de filtres */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <ListSortSelect
                id="sort-third-parties"
                value={listSort}
                onChange={setListSort}
                options={listSortOptions}
              />
              {!isClientsScope ? (
              <div>
                <Label className="text-sm font-medium text-muted-foreground mb-2">Type</Label>
                <Select value={filterType} onValueChange={(value) => setFilterType(value as ThirdPartyType | 'all')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les types</SelectItem>
                    <SelectItem value="proprietaire">Propriétaires</SelectItem>
                    <SelectItem value="client">Clients</SelectItem>
                    <SelectItem value="fournisseur">Fournisseurs</SelectItem>
                    <SelectItem value="employe">Personnel siège</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              ) : (
              <div className="flex flex-col justify-end">
                <Label className="text-sm font-medium text-muted-foreground mb-2">Affichage</Label>
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                  Clients uniquement
                </div>
              </div>
              )}
            </div>

            {isClientsScope && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-2 border-t border-dashed">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Plafond encours (fiche)</Label>
                  <Select
                    value={clientFilterPlafond}
                    onValueChange={(v) => setClientFilterPlafond(v as ClientPlafondFilter)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Indifférent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Indifférent</SelectItem>
                      <SelectItem value="defined">Plafond défini</SelectItem>
                      <SelectItem value="none">Sans plafond</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Commandes</Label>
                  <Select
                    value={clientFilterOrder}
                    onValueChange={(v) => setClientFilterOrder(v as ClientOrderFilter)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Indifférent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Indifférent</SelectItem>
                      <SelectItem value="yes">Au moins une commande</SelectItem>
                      <SelectItem value="no">Sans commande</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Coordonnées</Label>
                  <Select
                    value={clientFilterContact}
                    onValueChange={(v) => setClientFilterContact(v as ClientContactFilter)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Indifférent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Indifférent</SelectItem>
                      <SelectItem value="phone_set">Téléphone renseigné</SelectItem>
                      <SelectItem value="phone_missing">Téléphone absent</SelectItem>
                      <SelectItem value="email_set">Email renseigné</SelectItem>
                      <SelectItem value="email_missing">Email absent</SelectItem>
                      <SelectItem value="coords_incomplete">Fiche incomplète (tél., email ou adresse manquant)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {isClientsScope && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-2 border-t border-dashed">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Sexe</Label>
                  <Select
                    value={clientAdvancedFilters.sexe}
                    onValueChange={(v) =>
                      setClientAdvancedFilters((f) => ({
                        ...f,
                        sexe: v as ClientFilterState['sexe'],
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CLIENT_SEXE_FILTER_LABELS) as ClientFilterState['sexe'][]).map(
                        (k) => (
                          <SelectItem key={k} value={k}>
                            {CLIENT_SEXE_FILTER_LABELS[k]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Segment</Label>
                  <Select
                    value={clientAdvancedFilters.segment}
                    onValueChange={(v) =>
                      setClientAdvancedFilters((f) => ({
                        ...f,
                        segment: v as ClientFilterState['segment'],
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(CLIENT_SEGMENT_FILTER_LABELS) as ClientFilterState['segment'][]
                      ).map((k) => (
                        <SelectItem key={k} value={k}>
                          {CLIENT_SEGMENT_FILTER_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Ville</Label>
                  <Select
                    value={clientAdvancedFilters.ville}
                    onValueChange={(v) =>
                      setClientAdvancedFilters((f) => ({ ...f, ville: v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les villes</SelectItem>
                      {clientVilles.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Tranche d&apos;âge</Label>
                  <Select
                    value={clientAdvancedFilters.age}
                    onValueChange={(v) =>
                      setClientAdvancedFilters((f) => ({
                        ...f,
                        age: v as ClientFilterState['age'],
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CLIENT_AGE_FILTER_LABELS) as ClientFilterState['age'][]).map(
                        (k) => (
                          <SelectItem key={k} value={k}>
                            {CLIENT_AGE_FILTER_LABELS[k]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Encours / dette</Label>
                  <Select
                    value={clientAdvancedFilters.encours}
                    onValueChange={(v) =>
                      setClientAdvancedFilters((f) => ({
                        ...f,
                        encours: v as ClientFilterState['encours'],
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(CLIENT_ENCOURS_FILTER_LABELS) as ClientFilterState['encours'][]
                      ).map((k) => (
                        <SelectItem key={k} value={k}>
                          {CLIENT_ENCOURS_FILTER_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Activité commandes</Label>
                  <Select
                    value={clientAdvancedFilters.activity}
                    onValueChange={(v) =>
                      setClientAdvancedFilters((f) => ({
                        ...f,
                        activity: v as ClientFilterState['activity'],
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(CLIENT_ACTIVITY_FILTER_LABELS) as ClientFilterState['activity'][]
                      ).map((k) => (
                        <SelectItem key={k} value={k}>
                          {CLIENT_ACTIVITY_FILTER_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Livraisons</Label>
                  <Select
                    value={clientAdvancedFilters.livraison}
                    onValueChange={(v) =>
                      setClientAdvancedFilters((f) => ({
                        ...f,
                        livraison: v as ClientFilterState['livraison'],
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(CLIENT_LIVRAISON_FILTER_LABELS) as ClientFilterState['livraison'][]
                      ).map((k) => (
                        <SelectItem key={k} value={k}>
                          {CLIENT_LIVRAISON_FILTER_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedThirdParties.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm ||
              (!isClientsScope && filterType !== 'all') ||
              (isClientsScope && anyClientFilterActive)
                ? isClientsScope
                  ? 'Aucun client ne correspond aux filtres ou à la recherche'
                  : 'Aucun tier ne correspond à votre recherche'
                : isClientsScope
                  ? 'Aucun client enregistré'
                  : 'Aucun tier enregistré'}
            </p>
          </div>
        ) : (
          sortedThirdParties.map((thirdParty) => {
            const trucksCount = trucks.filter(t => t.proprietaireId === thirdParty.id).length;
            
            return (
              <Card key={thirdParty.id} className="hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/30 group">
                <CardHeader className="bg-gradient-to-br from-background to-muted/20 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-lg">{thirdParty.nom}</CardTitle>
                      </div>
                      <Badge className={getTypeColor(thirdParty.type)}>
                        <span className="mr-1">{getTypeIcon(thirdParty.type)}</span>
                        {getTypeLabel(thirdParty.type)}
                      </Badge>
                      {thirdParty.type === 'client' && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {thirdParty.sexe && (
                            <Badge variant="outline" className="text-xs">
                              {formatClientSexeFr(thirdParty.sexe)}
                            </Badge>
                          )}
                          {thirdParty.segmentClient && (
                            <Badge variant="outline" className="text-xs">
                              {formatClientSegmentFr(thirdParty.segmentClient)}
                            </Badge>
                          )}
                          {thirdParty.ville && (
                            <Badge variant="outline" className="text-xs">
                              📍 {thirdParty.ville}
                            </Badge>
                          )}
                          {getClientAgeYears(thirdParty.dateNaissance) != null && (
                            <Badge variant="outline" className="text-xs">
                              {getClientAgeYears(thirdParty.dateNaissance)} ans
                            </Badge>
                          )}
                          {(() => {
                            const enc = getEncoursClient(
                              thirdParty,
                              invoices,
                              creditsForPlafondSheet,
                            );
                            if (enc <= 0.01) return null;
                            return (
                              <Badge variant="secondary" className="text-xs">
                                Encours {formatFcfa(Math.round(enc))}
                              </Badge>
                            );
                          })()}
                        </div>
                      )}
                      {thirdParty.type === 'proprietaire' && trucksCount > 0 && (
                        <Badge variant="outline" className="ml-2">
                          {trucksCount} camion{trucksCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {thirdParty.type === 'fournisseur' && (() => {
                        const s = supplierSummaryById.get(thirdParty.id);
                        if (!s) return null;
                        return (
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Badge variant={supplierEtatBadgeVariant(s.etat)} className="text-xs">
                              {formatSupplierEtatFr(s.etat)}
                            </Badge>
                            {s.chargementsEnAttente > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {s.chargementsEnAttente} bon(s) à affecter
                              </Badge>
                            )}
                            <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                              <Link to={`/fournisseurs?id=${thirdParty.id}`}>Mouvements</Link>
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                    {(thirdParty.type === 'client' || canManageFleet) && (
                    <div className="flex flex-wrap gap-1 justify-end">
                      {thirdParty.type === 'client' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDetailClient(thirdParty)}
                          className="opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity duration-300"
                        >
                          <PanelRight className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Détails</span>
                        </Button>
                      )}
                      {canManageFleet && (
                        <>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleEdit(thirdParty)}
                            className="opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity duration-300"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive" 
                            onClick={() => handleDelete(thirdParty.id)}
                            className="opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity duration-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {thirdParty.telephone && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{EMOJI.telephone}</span>
                        <span>{thirdParty.telephone}</span>
                      </div>
                    )}
                    {thirdParty.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{EMOJI.email}</span>
                        <span className="truncate">{thirdParty.email}</span>
                      </div>
                    )}
                    {thirdParty.adresse && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground">📍</span>
                        <span className="flex-1">{thirdParty.adresse}</span>
                      </div>
                    )}
                    {thirdParty.type === 'client' && thirdParty.plafondCredit != null && (
                      <div className="flex items-center gap-2 text-sm rounded-md bg-muted/50 px-2 py-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Plafond encours clients :</span>
                        <span className="font-medium">{formatFcfa(Math.round(thirdParty.plafondCredit))}</span>
                      </div>
                    )}
                    {thirdParty.notes && (
                      <div className="pt-2 border-t border-dashed">
                        <p className="text-xs text-muted-foreground mb-1">Notes:</p>
                        <p className="text-sm">{thirdParty.notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Sheet open={!!detailClient} onOpenChange={(open) => { if (!open) setDetailClient(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailClient && detailClient.type === 'client' && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{detailClient.nom}</SheetTitle>
                <SheetDescription>
                  Commandes du donneur d&apos;ordre, livraisons et créances pour ce client.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Coordonnées</h3>
                  <div className="space-y-2 text-sm rounded-lg border bg-muted/30 p-3">
                    {detailClient.telephone && (
                      <p><span className="text-muted-foreground">Tél. </span>{detailClient.telephone}</p>
                    )}
                    {detailClient.email && (
                      <p className="break-all"><span className="text-muted-foreground">Email </span>{detailClient.email}</p>
                    )}
                    {detailClient.adresse && (
                      <p><span className="text-muted-foreground">Adresse </span>{detailClient.adresse}</p>
                    )}
                    {!detailClient.telephone && !detailClient.email && !detailClient.adresse && (
                      <p className="text-muted-foreground">Aucune coordonnée renseignée.</p>
                    )}
                    {detailClient.notes && (
                      <div className="pt-2 border-t border-dashed mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Notes internes</p>
                        <p className="whitespace-pre-wrap">{detailClient.notes}</p>
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Profil</h3>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm grid grid-cols-2 gap-2">
                    <p>
                      <span className="text-muted-foreground">Sexe :</span>{' '}
                      {formatClientSexeFr(detailClient.sexe)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Segment :</span>{' '}
                      {formatClientSegmentFr(detailClient.segmentClient)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Ville :</span>{' '}
                      {detailClient.ville?.trim() || '—'}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Âge :</span>{' '}
                      {getClientAgeYears(detailClient.dateNaissance) != null
                        ? `${getClientAgeYears(detailClient.dateNaissance)} ans`
                        : detailClient.dateNaissance || '—'}
                    </p>
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-rose-600" />
                    Plafond et encours (commandes non payées)
                  </h3>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                    <p>
                      <span className="text-muted-foreground">Dette / solde initial :</span>{' '}
                      <span className="font-semibold">
                        {detailSoldeInitial != null && detailSoldeInitial > 0
                          ? formatFcfa(detailSoldeInitial)
                          : 'Aucun'}
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 ml-2 text-xs"
                        onClick={() => void handleEdit(detailClient)}
                      >
                        Modifier
                      </Button>
                    </p>
                    {detailClient.plafondCredit != null ? (
                      <>
                        <p>
                          <span className="text-muted-foreground">Plafond fixé :</span>{' '}
                          <span className="font-semibold">{formatFcfa(Math.round(detailClient.plafondCredit))}</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Encours créances (estimé) :</span>{' '}
                          <span className="font-medium">{formatFcfa(Math.round(encoursFicheClient.total))}</span>
                        </p>
                        {(encoursFicheClient.factures > 0 || encoursFicheClient.credits > 0) && (
                          <p className="text-xs text-muted-foreground">
                            Dont factures impayées (commandes / livraisons) :{' '}
                            {formatFcfa(Math.round(encoursFicheClient.factures))}
                            {encoursFicheClient.credits > 0 && (
                              <>
                                {' '}
                                · solde initial / autres :{' '}
                                {formatFcfa(Math.round(encoursFicheClient.credits))}
                              </>
                            )}
                          </p>
                        )}
                        <p>
                          <span className="text-muted-foreground">Marge sous plafond :</span>{' '}
                          <span
                            className={
                              encoursFicheClient.total > detailClient.plafondCredit + 0.01
                                ? 'font-semibold text-destructive'
                                : 'font-medium text-emerald-700 dark:text-emerald-400'
                            }
                          >
                            {formatFcfa(Math.round(Math.max(0, detailClient.plafondCredit - encoursFicheClient.total)))}
                          </span>
                        </p>
                        {encoursFicheClient.total > detailClient.plafondCredit + 0.01 && (
                          <p className="text-xs text-destructive">
                            L'encours dépasse le plafond : régularisez les commandes non payées ou le plafond dans la fiche client.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Aucun plafond défini. Vous pouvez en fixer un via « Modifier » sur cette fiche.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Basé sur les <span className="font-medium">factures impayées</span> (FAC-CMD, FAC-LIV…) et le solde initial saisi sur la fiche.
                    </p>
                    <Link to="/factures" className="inline-block text-xs text-primary hover:underline pt-1">
                      Voir les factures
                    </Link>
                  </div>
                </section>

                <Separator />

                <ClientOperationsPanels
                  clientId={detailClient.id}
                  defaultDestination={detailClient.adresse}
                />

              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}


