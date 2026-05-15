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
import { Plus, Trash2, Edit, Building2, Users, Truck, Search, Filter, X, FileDown, FileText, Loader2, Route, Package, UserCircle2, PanelRight, CreditCard, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { PAGE_CLIENTS_DESCRIPTION, PAGE_TIERS_DESCRIPTION } from '@/lib/metier-activite';
import { useAuth } from '@/contexts/AuthContext';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import { frCollator, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { formatTripStatusFr } from '@/lib/sync-utils';
import { matchClientReference } from '@/lib/client-tier-match';
import { loadCreditsList } from '@/lib/load-credits-list';
import type { CreditLike } from '@/lib/client-credit-plafond';
import { sumEncoursPretsPourClient } from '@/lib/client-credit-plafond';

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
type ClientTripFilter = 'all' | 'yes' | 'no';
type ClientParcelFilter = 'all' | 'yes' | 'no';
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
    trips,
    invoices,
    expenses,
    parcelExpeditions,
    createThirdParty,
    updateThirdParty,
    deleteThirdParty,
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
  const [clientFilterTrip, setClientFilterTrip] = useState<ClientTripFilter>('all');
  const [clientFilterParcel, setClientFilterParcel] = useState<ClientParcelFilter>('all');
  const [clientFilterContact, setClientFilterContact] = useState<ClientContactFilter>('all');
  const [detailClient, setDetailClient] = useState<ThirdParty | null>(null);
  const [creditsForPlafondSheet, setCreditsForPlafondSheet] = useState<CreditLike[]>([]);

  const [formData, setFormData] = useState({
    nom: '',
    telephone: '',
    email: '',
    adresse: '',
    type: 'proprietaire' as ThirdPartyType,
    notes: '',
    plafondCredit: '' as number | '',
  });

  const resetForm = () => {
    setFormData({
      nom: '',
      telephone: '',
      email: '',
      adresse: '',
      type: scope === 'clients' ? 'client' : 'proprietaire',
      notes: '',
      plafondCredit: '',
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
              }
            : editingThirdParty
              ? { plafondCredit: null }
              : {}),
        };

        if (editingThirdParty) {
          await updateThirdParty(editingThirdParty.id, payload);
          toast.success(isClientsScope ? 'Client modifié avec succès' : 'Tier modifié avec succès');
        } else {
          await createThirdParty(payload);
          const clientListFiltersActive =
            isClientsScope &&
            (searchTerm.trim() !== '' ||
              clientFilterPlafond !== 'all' ||
              clientFilterTrip !== 'all' ||
              clientFilterParcel !== 'all' ||
              clientFilterContact !== 'all');
          toast.success(
            isClientsScope
              ? clientListFiltersActive
                ? 'Client ajouté. Si la fiche n’apparaît pas, les filtres actifs peuvent la masquer — cliquez sur « Réinitialiser ».'
                : 'Client ajouté avec succès'
              : 'Tier ajouté avec succès',
          );
        }
        setIsDialogOpen(false);
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      }
    });
  };

  const handleEdit = (thirdParty: ThirdParty) => {
    setEditingThirdParty(thirdParty);
    setFormData({
      nom: thirdParty.nom,
      telephone: thirdParty.telephone || '',
      email: thirdParty.email || '',
      adresse: thirdParty.adresse || '',
      type: thirdParty.type,
      notes: thirdParty.notes || '',
      plafondCredit: thirdParty.plafondCredit != null ? Math.round(thirdParty.plafondCredit) : '',
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
          `Impossible de supprimer ce personnel : ${depensesLiees.length} dépense(s) y sont liées (salaires ou factures fournisseur). Retirez d’abord le lien sur les dépenses.`,
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

  const clientHasTripLink = (tp: ThirdParty) =>
    tp.type === 'client' &&
    trips.some(
      (t) =>
        matchClientReference(t.client, tp.nom) ||
        (t.clientParticipants ?? []).some((p) => p.tierId === tp.id),
    );

  const clientHasParcelLink = (tp: ThirdParty) =>
    tp.type === 'client' &&
    parcelExpeditions.some((ex) =>
      ex.lots.some((lot) => matchClientReference(lot.clients, tp.nom)),
    );

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
        (tp.plafondCredit != null &&
          String(Math.round(tp.plafondCredit)).includes(search.replace(/\s/g, '')));
      if (!matchSearch) return false;
    }
    if (isClientsScope && tp.type === 'client') {
      const hasPlafond = tp.plafondCredit != null && Number.isFinite(tp.plafondCredit);
      if (clientFilterPlafond === 'defined' && !hasPlafond) return false;
      if (clientFilterPlafond === 'none' && hasPlafond) return false;
      if (clientFilterTrip === 'yes' && !clientHasTripLink(tp)) return false;
      if (clientFilterTrip === 'no' && clientHasTripLink(tp)) return false;
      if (clientFilterParcel === 'yes' && !clientHasParcelLink(tp)) return false;
      if (clientFilterParcel === 'no' && clientHasParcelLink(tp)) return false;
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
  const employesCount = thirdParties.filter((tp) => tp.type === 'employe').length;

  const clientTiers = useMemo(
    () => thirdParties.filter((tp) => tp.type === 'client'),
    [thirdParties],
  );

  const tripsWithRegisteredClient = useMemo(
    () =>
      trips.filter(
        (t) => t.client && clientTiers.some((c) => matchClientReference(t.client, c.nom)),
      ).length,
    [trips, clientTiers],
  );

  const parcelExpWithRegisteredClient = useMemo(
    () =>
      parcelExpeditions.filter((ex) =>
        ex.lots.some((lot) =>
          clientTiers.some((c) => matchClientReference(lot.clients, c.nom)),
        ),
      ).length,
    [parcelExpeditions, clientTiers],
  );

  const clientDetailInsights = useMemo(() => {
    if (!detailClient || detailClient.type !== 'client') return null;
    const nom = detailClient.nom;
    const tripInvolvesClient = (t: (typeof trips)[0]) =>
      matchClientReference(t.client, nom) ||
      (t.clientParticipants ?? []).some((p) => p.tierId === detailClient.id);

    const relatedTrips = trips
      .filter((t) => tripInvolvesClient(t))
      .sort((a, b) => new Date(b.dateDepart).getTime() - new Date(a.dateDepart).getTime());
    const tripIds = new Set(relatedTrips.map((t) => t.id));
    const tripInvoices = invoices.filter((inv) => {
      if (!inv.trajetId || !tripIds.has(inv.trajetId)) return false;
      if (inv.clientTierId === detailClient.id) return true;
      if (
        (inv.paiementsEncaissements ?? []).some(
          (s) =>
            s.clientTierId === detailClient.id ||
            (s.payeurLibelle?.trim() && matchClientReference(s.payeurLibelle, nom)),
        )
      )
        return true;
      if (!inv.clientTierId && inv.factureClientLibelle?.trim()) {
        return matchClientReference(inv.factureClientLibelle, nom);
      }
      const tr = trips.find((t) => t.id === inv.trajetId);
      return matchClientReference(tr?.client, nom);
    });
    const relatedParcelEx = parcelExpeditions.filter((ex) =>
      ex.lots.some((lot) => matchClientReference(lot.clients, nom)),
    );
    const parcelIds = new Set(relatedParcelEx.map((ex) => ex.id));
    const parcelInvoices = invoices.filter(
      (inv) => inv.parcelExpeditionId && parcelIds.has(inv.parcelExpeditionId),
    );
    const recetteTrips = relatedTrips.reduce((s, t) => s + t.recette, 0);
    return { relatedTrips, tripInvoices, relatedParcelEx, parcelInvoices, recetteTrips };
  }, [detailClient, trips, invoices, parcelExpeditions]);

  useEffect(() => {
    if (!detailClient || detailClient.type !== 'client') {
      setCreditsForPlafondSheet([]);
      return;
    }
    let cancelled = false;
    loadCreditsList().then((list) => {
      if (!cancelled) setCreditsForPlafondSheet(list);
    });
    return () => {
      cancelled = true;
    };
  }, [detailClient?.id, detailClient?.type]);

  const encoursPretsFicheClient = useMemo(() => {
    if (!detailClient || detailClient.type !== 'client') return 0;
    return sumEncoursPretsPourClient(creditsForPlafondSheet, {
      id: detailClient.id,
      nom: detailClient.nom,
    });
  }, [detailClient, creditsForPlafondSheet]);

  const listSortOptions = useMemo(
    () => (isClientsScope ? [...CLIENT_SORT_OPTIONS] : [...THIRD_SORT_OPTIONS]),
    [isClientsScope],
  );

  const clientPlafondFilterLabel: Record<ClientPlafondFilter, string> = {
    all: '',
    defined: 'Plafond encours défini',
    none: 'Sans plafond encours',
  };
  const clientTripFilterLabel: Record<ClientTripFilter, string> = {
    all: '',
    yes: 'Au moins un trajet relié',
    no: 'Aucun trajet relié',
  };
  const clientParcelFilterLabel: Record<ClientParcelFilter, string> = {
    all: '',
    yes: 'Au moins une expédition colis',
    no: 'Aucune expédition colis',
  };
  const clientContactFilterLabel: Record<ClientContactFilter, string> = {
    all: '',
    phone_set: 'Téléphone renseigné',
    phone_missing: 'Téléphone absent',
    email_set: 'Email renseigné',
    email_missing: 'Email absent',
    coords_incomplete: 'Coordonnées incomplètes (tél., email ou adresse manquant)',
  };

  const getFiltersDescription = () => {
    const filters: string[] = [];
    if (searchTerm) filters.push(`Recherche: "${searchTerm}"`);
    if (isClientsScope) {
      filters.push('Vue clients');
      if (clientFilterPlafond !== 'all') filters.push(clientPlafondFilterLabel[clientFilterPlafond]);
      if (clientFilterTrip !== 'all') filters.push(clientTripFilterLabel[clientFilterTrip]);
      if (clientFilterParcel !== 'all') filters.push(clientParcelFilterLabel[clientFilterParcel]);
      if (clientFilterContact !== 'all') filters.push(clientContactFilterLabel[clientFilterContact]);
    } else if (filterType !== 'all') filters.push(`Type: ${getTypeLabel(filterType)}`);
    const sortLabel = listSortOptions.find((o) => o.value === listSort)?.label;
    if (sortLabel) filters.push(`Tri: ${sortLabel}`);
    return filters.length > 0 ? `Filtres appliqués: ${filters.join(', ')}` : sortLabel ? `Tri: ${sortLabel}` : undefined;
  };

  // Fonctions d'export
  const handleExportExcel = () => {
    const exportTitle = isClientsScope ? 'Liste des clients' : 'Liste des Tiers';
    const exportPrefix = isClientsScope ? 'clients' : 'tiers';
    exportToExcel({
      title: exportTitle,
      fileName: `${exportPrefix}_${new Date().toISOString().split('T')[0]}.xlsx`,
      filtersDescription: getFiltersDescription(),
      columns: [
        { header: 'Nom', value: (tp) => tp.nom },
        { header: 'Type', value: (tp) => getTypeLabel(tp.type) },
        { header: 'Téléphone', value: (tp) => tp.telephone || '-' },
        { header: 'Email', value: (tp) => tp.email || '-' },
        { header: 'Adresse', value: (tp) => tp.adresse || '-' },
        { header: 'Plafond encours clients (FCFA)', value: (tp) => (tp.type === 'client' && tp.plafondCredit != null ? String(Math.round(tp.plafondCredit)) : '-') },
        { header: 'Notes', value: (tp) => tp.notes || '-' },
      ],
      rows: sortedThirdParties,
    });
    toast.success('Export Excel généré avec succès');
  };

  const handleExportPDF = () => {
    const totalProprietaires = filteredThirdParties.filter((tp) => tp.type === 'proprietaire').length;
    const totalClients = filteredThirdParties.filter((tp) => tp.type === 'client').length;
    const totalFournisseurs = filteredThirdParties.filter((tp) => tp.type === 'fournisseur').length;
    const totalEmployes = filteredThirdParties.filter((tp) => tp.type === 'employe').length;
    const exportTitle = isClientsScope ? 'Liste des clients' : 'Liste des Tiers';
    const exportPrefix = isClientsScope ? 'clients' : 'tiers';
    const headerColor = isClientsScope ? '#059669' : '#4f46e5';

    exportToPrintablePDF({
      title: exportTitle,
      fileName: `${exportPrefix}_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: getFiltersDescription(),
      headerColor,
      headerTextColor: '#ffffff',
      evenRowColor: isClientsScope ? '#ecfdf5' : '#eef2ff',
      oddRowColor: '#ffffff',
      accentColor: headerColor,
      totals: isClientsScope
        ? [
            { label: 'Clients', value: filteredThirdParties.length, style: 'positive' as const, icon: '👥' },
            { label: 'Trajets reliés', value: tripsWithRegisteredClient, style: 'neutral' as const, icon: EMOJI.liste },
            { label: 'Expéditions colis', value: parcelExpWithRegisteredClient, style: 'neutral' as const, icon: '📦' },
          ]
        : [
            { label: 'Total Tiers', value: filteredThirdParties.length, style: 'neutral', icon: EMOJI.liste },
            { label: 'Propriétaires', value: totalProprietaires, style: 'neutral', icon: '🏢' },
            { label: 'Clients', value: totalClients, style: 'positive', icon: '👥' },
            { label: 'Fournisseurs', value: totalFournisseurs, style: 'neutral', icon: '🏭' },
            { label: 'Personnel siège', value: totalEmployes, style: 'neutral', icon: '💼' },
          ],
      columns: [
        { header: 'Nom', value: (tp) => tp.nom },
        { header: 'Type', value: (tp) => {
          const icons: Record<string, string> = {
            'proprietaire': '🏢',
            'client': '👥',
            'fournisseur': '🏭',
            employe: '💼',
          };
          return `${icons[tp.type] || '📋'} ${getTypeLabel(tp.type)}`;
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
        description={isClientsScope ? PAGE_CLIENTS_DESCRIPTION : PAGE_TIERS_DESCRIPTION}
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
                  label: 'Trajets reliés',
                  value: tripsWithRegisteredClient,
                  icon: <Route className="h-4 w-4" />,
                  color: 'text-teal-600 dark:text-teal-400',
                },
                {
                  label: 'Expéditions colis',
                  value: parcelExpWithRegisteredClient,
                  icon: <Package className="h-4 w-4" />,
                  color: 'text-cyan-600 dark:text-cyan-400',
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
                  <div>
                    <Label htmlFor="plafond-credit">Plafond encours clients — commandes non payées (FCFA)</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Montant maximal cumulé autorisé pour ce client dans le suivi créances (lignes « commande sans paiement »). Vide = pas de limite.
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
              (isClientsScope &&
                (clientFilterPlafond !== 'all' ||
                  clientFilterTrip !== 'all' ||
                  clientFilterParcel !== 'all' ||
                  clientFilterContact !== 'all'))) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setListSort('nom_asc');
                  if (!isClientsScope) setFilterType('all');
                  else {
                    setFilterType('client');
                    setClientFilterPlafond('all');
                    setClientFilterTrip('all');
                    setClientFilterParcel('all');
                    setClientFilterContact('all');
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
                      ? 'Nom, téléphone, email, adresse, notes ou montant de plafond…'
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

            {isClientsScope &&
              (clientFilterPlafond !== 'all' ||
                clientFilterTrip !== 'all' ||
                clientFilterParcel !== 'all' ||
                clientFilterContact !== 'all') && (
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
                  {clientFilterTrip !== 'all' && (
                    <Badge variant="secondary" className="bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/20 px-3 py-1.5">
                      {clientTripFilterLabel[clientFilterTrip]}
                      <button
                        type="button"
                        onClick={() => setClientFilterTrip('all')}
                        className="ml-2 hover:bg-teal-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre trajets"
                        title="Retirer le filtre trajets"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {clientFilterParcel !== 'all' && (
                    <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 border-cyan-500/20 px-3 py-1.5">
                      {clientParcelFilterLabel[clientFilterParcel]}
                      <button
                        type="button"
                        onClick={() => setClientFilterParcel('all')}
                        className="ml-2 hover:bg-cyan-500/20 rounded-full p-0.5"
                        aria-label="Retirer le filtre colis"
                        title="Retirer le filtre colis"
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
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Lien trajets</Label>
                  <Select
                    value={clientFilterTrip}
                    onValueChange={(v) => setClientFilterTrip(v as ClientTripFilter)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Indifférent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Indifférent</SelectItem>
                      <SelectItem value="yes">Au moins un trajet relié</SelectItem>
                      <SelectItem value="no">Aucun trajet relié</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Nom sur mission ou participant structuré.</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2">Lien expéditions colis</Label>
                  <Select
                    value={clientFilterParcel}
                    onValueChange={(v) => setClientFilterParcel(v as ClientParcelFilter)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Indifférent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Indifférent</SelectItem>
                      <SelectItem value="yes">Au moins une expédition</SelectItem>
                      <SelectItem value="no">Aucune expédition</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Client mentionné sur une ligne colis.</p>
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
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedThirdParties.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">
              {searchTerm ||
              (!isClientsScope && filterType !== 'all') ||
              (isClientsScope &&
                (clientFilterPlafond !== 'all' ||
                  clientFilterTrip !== 'all' ||
                  clientFilterParcel !== 'all' ||
                  clientFilterContact !== 'all'))
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
                      {thirdParty.type === 'proprietaire' && trucksCount > 0 && (
                        <Badge variant="outline" className="ml-2">
                          {trucksCount} camion{trucksCount > 1 ? 's' : ''}
                        </Badge>
                      )}
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
          {detailClient && clientDetailInsights && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8">{detailClient.nom}</SheetTitle>
                <SheetDescription>
                  Partenaire commercial : trajets et colis reliés par le nom sur la mission ou les lots ; factures
                  trajet reliées par la fiche, le libellé « facturé à », ou à défaut le client renseigné sur le trajet.
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
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-rose-600" />
                    Plafond et encours (commandes non payées)
                  </h3>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
                    {detailClient.plafondCredit != null ? (
                      <>
                        <p>
                          <span className="text-muted-foreground">Plafond fixé :</span>{' '}
                          <span className="font-semibold">{formatFcfa(Math.round(detailClient.plafondCredit))}</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Encours créances (estimé) :</span>{' '}
                          <span className="font-medium">{formatFcfa(Math.round(encoursPretsFicheClient))}</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Marge sous plafond :</span>{' '}
                          <span
                            className={
                              encoursPretsFicheClient > detailClient.plafondCredit + 0.01
                                ? 'font-semibold text-destructive'
                                : 'font-medium text-emerald-700 dark:text-emerald-400'
                            }
                          >
                            {formatFcfa(Math.round(Math.max(0, detailClient.plafondCredit - encoursPretsFicheClient)))}
                          </span>
                        </p>
                        {encoursPretsFicheClient > detailClient.plafondCredit + 0.01 && (
                          <p className="text-xs text-destructive">
                            L’encours dépasse le plafond : régularisez les commandes non payées ou le plafond dans la fiche client.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Aucun plafond défini. Vous pouvez en fixer un via « Modifier » sur cette fiche.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Les montants viennent du suivi créances : lignes « commande sans paiement »
                      <span className="font-medium"> rattachées à cette fiche</span> par identifiant, sinon celles dont le nom client correspond au texte saisi sur la ligne.
                    </p>
                    <Link to="/credits" className="inline-block text-xs text-primary hover:underline pt-1">
                      Ouvrir le registre Créances
                    </Link>
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Route className="h-4 w-4 text-emerald-600" />
                      Trajets ({clientDetailInsights.relatedTrips.length})
                    </h3>
                    <Link to="/trajets" className="text-xs text-primary hover:underline shrink-0">
                      Ouvrir les trajets
                    </Link>
                  </div>
                  {clientDetailInsights.relatedTrips.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun trajet ne référence ce client (champ « Client » du trajet).</p>
                  ) : (
                    <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {clientDetailInsights.relatedTrips.slice(0, 14).map((t) => (
                        <li key={t.id} className="rounded-lg border bg-card p-2.5 text-sm">
                          <div className="flex justify-between gap-2 font-medium">
                            <span>{t.origine} → {t.destination}</span>
                            <span className="shrink-0 text-muted-foreground">{t.dateDepart}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                            <span>{formatTripStatusFr(t.statut)}</span>
                            <span>Recette {formatFcfa(t.recette)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {clientDetailInsights.relatedTrips.length > 14 && (
                    <p className="text-xs text-muted-foreground mt-2">+ {clientDetailInsights.relatedTrips.length - 14} autre(s) trajet(s).</p>
                  )}
                  {clientDetailInsights.recetteTrips > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Somme des recettes déclarées sur ces trajets : {formatFcfa(clientDetailInsights.recetteTrips)}
                    </p>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    Factures — trajets ({clientDetailInsights.tripInvoices.length})
                  </h3>
                  {clientDetailInsights.tripInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucune facture trajet attribuée à ce client (fiche, libellé facture ou client du trajet).
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm max-h-40 overflow-y-auto">
                      {clientDetailInsights.tripInvoices.map((inv) => (
                        <li key={inv.id} className="flex justify-between gap-2 rounded-md border px-2 py-1.5">
                          <span className="font-mono text-xs">{inv.numero}</span>
                          <span className="shrink-0">{formatFcfa(inv.montantTTC)} — {invoiceStatutLabel(inv.statut)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to="/factures" className="inline-block text-xs text-primary hover:underline mt-2">
                    Voir les factures
                  </Link>
                </section>

                <Separator />

                <section>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Package className="h-4 w-4 text-cyan-600" />
                      Expéditions colis ({clientDetailInsights.relatedParcelEx.length})
                    </h3>
                    <Link to="/envoi-colis" className="text-xs text-primary hover:underline shrink-0">
                      Expéditions
                    </Link>
                  </div>
                  {clientDetailInsights.relatedParcelEx.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune expédition ne mentionne ce client sur une ligne colis.</p>
                  ) : (
                    <ul className="space-y-2 text-sm max-h-40 overflow-y-auto">
                      {clientDetailInsights.relatedParcelEx.slice(0, 12).map((ex) => (
                        <li key={ex.id} className="rounded-lg border bg-card p-2.5">
                          <div className="font-medium">{ex.reference || 'Sans réf.'}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{ex.origine} → {ex.destination}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    Factures — colis ({clientDetailInsights.parcelInvoices.length})
                  </h3>
                  {clientDetailInsights.parcelInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune facture colis pour ces expéditions.</p>
                  ) : (
                    <ul className="space-y-2 text-sm max-h-32 overflow-y-auto">
                      {clientDetailInsights.parcelInvoices.map((inv) => (
                        <li key={inv.id} className="flex justify-between gap-2 rounded-md border px-2 py-1.5">
                          <span className="font-mono text-xs">{inv.numero}</span>
                          <span className="shrink-0">{formatFcfa(inv.montantTTC)} — {invoiceStatutLabel(inv.statut)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}


