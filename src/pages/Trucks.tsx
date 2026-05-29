import { useMemo, useState } from 'react';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useApp, Truck, TruckType, TruckStatus, TruckSousType, ThirdParty } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Filter, Eye, Truck as TruckIcon, Link2, Search, X, Route, DollarSign, FileDown, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  isTruckInUse,
  calculateTruckStats,
  countRemorquesForFleetStats,
  countTracteursJumeles,
} from '@/lib/sync-utils';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';

const TRUCK_SORT_OPTIONS = [
  { value: 'immat_asc', label: 'Immatriculation A → Z' },
  { value: 'immat_desc', label: 'Immatriculation Z → A' },
  { value: 'modele_asc', label: 'Modèle A → Z' },
  { value: 'modele_desc', label: 'Modèle Z → A' },
  { value: 'circ_desc', label: 'Mise en circulation (récent → ancien)' },
  { value: 'circ_asc', label: 'Mise en circulation (ancien → récent)' },
  { value: 'recette_desc', label: 'Chiffre d’affaires (plus haut → plus bas)' },
  { value: 'recette_asc', label: 'Chiffre d’affaires (plus bas → plus haut)' },
  { value: 'depense_desc', label: 'Dépenses (plus haut → plus bas)' },
  { value: 'depense_asc', label: 'Dépenses (plus bas → plus haut)' },
] as const;

function labelTruckType(truck: Pick<Truck, 'type' | 'sousType'>): string {
  if (truck.type === 'remorqueuse') return 'Remorque seule (historique)';
  if (truck.sousType === 'tracteur_jumele') return 'Tracteur + remorque';
  return 'Tracteur seul';
}

/**
 * En base, un jumelé a souvent `immatriculation` = « TRACT-REMORQ » et `remorqueImmatriculation` = REMORQ.
 * Le formulaire doit n’afficher que la plaque tracteur dans le premier champ.
 */
function tracteurImmatForForm(truck: Truck): string {
  if (truck.type !== 'tracteur') return truck.immatriculation;
  const rem = (truck.remorqueImmatriculation || '').trim().replace(/\s+/g, '').toUpperCase();
  const jumele = truck.sousType === 'tracteur_jumele' || !!rem;
  if (!jumele || !rem) return truck.immatriculation;
  let full = truck.immatriculation.trim().replace(/\s+/g, '').toUpperCase();
  const suffix = `-${rem}`;
  // Retirer toutes les répétitions « -REMORQ » en fin (ex. bug ancien : TRACT-REM-REM).
  let guard = 0;
  while (full.endsWith(suffix) && guard < 10) {
    full = full.slice(0, -suffix.length);
    guard += 1;
  }
  return full || truck.immatriculation;
}

function splitCombinedTruckImmat(immatriculation: string): { tracteur: string; remorque?: string } {
  const parts = immatriculation
    .trim()
    .toUpperCase()
    .split(/\s*(?:-|\/|\+|\\)\s*|\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return { tracteur: parts[0], remorque: parts.slice(1).join('-') };
  }

  return { tracteur: immatriculation.trim().toUpperCase() };
}

function exportTracteurImmat(truck: Truck): string {
  if (truck.type !== 'tracteur') return '-';
  const separateRemorque = truck.remorqueImmatriculation?.trim();
  if (separateRemorque) return tracteurImmatForForm(truck);
  return splitCombinedTruckImmat(truck.immatriculation).tracteur || truck.immatriculation;
}

function exportRemorqueImmat(truck: Truck): string {
  if (truck.type === 'remorqueuse') return truck.immatriculation;
  const separateRemorque = truck.remorqueImmatriculation?.trim();
  if (separateRemorque) return separateRemorque.toUpperCase();
  if (truck.sousType !== 'tracteur_jumele') return '-';
  return splitCombinedTruckImmat(truck.immatriculation).remorque || '-';
}

export default function Trucks() {
  const { trucks, trips, parcelExpeditions, expenses, invoices, clientDeliveries, drivers, thirdParties, createTruck, updateTruck, deleteTruck, deleteExpense } = useApp();
  const { canManageFleet } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [filterType, setFilterType] = useState<TruckType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<TruckStatus | 'all'>('all');
  const [filterProprietaire, setFilterProprietaire] = useState<string>('all');
  const [filterModele, setFilterModele] = useState<string>('all');
  const [filterMinTrips, setFilterMinTrips] = useState<string>('');
  const [filterMaxTrips, setFilterMaxTrips] = useState<string>('');
  const [filterMinRecettes, setFilterMinRecettes] = useState<string>('');
  const [filterMaxRecettes, setFilterMaxRecettes] = useState<string>('');
  const [filterMinDepenses, setFilterMinDepenses] = useState<string>('');
  const [filterMaxDepenses, setFilterMaxDepenses] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [listSort, setListSort] = useState<string>('immat_asc');
  const [viewingTruck, setViewingTruck] = useState<Truck | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [formData, setFormData] = useState({
    immatriculation: '',
    remorqueImmatriculation: '',
    modele: '',
    type: 'tracteur' as TruckType,
    sousType: 'tracteur_seul' as TruckSousType,
    statut: 'actif' as TruckStatus,
    dateMiseEnCirculation: '',
    photo: '',
    proprietaireId: '',
    chauffeurId: '',
  });

  const resetForm = () => {
    setFormData({
      immatriculation: '',
      remorqueImmatriculation: '',
      modele: '',
      type: 'tracteur',
      sousType: 'tracteur_seul',
      statut: 'actif',
      dateMiseEnCirculation: '',
      photo: '',
      proprietaireId: '',
      chauffeurId: '',
    });
    setEditingTruck(null);
    setPhotoPreview('');
  };


  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE_BYTES = 1 * 1024 * 1024; // 1 Mo
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Image trop lourde (max 1 Mo). Réduis la taille avant de l’importer.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setPhotoPreview(result);
      setFormData({ ...formData, photo: result });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.type === 'remorqueuse') {
      const imm = formData.immatriculation.trim().toUpperCase().replace(/\s+/g, '');
      if (!imm) {
        toast.error("L'immatriculation est obligatoire.");
        return;
      }
      const truckData = {
        immatriculation: imm,
        remorqueImmatriculation: undefined as string | undefined,
        modele: formData.modele,
        type: 'remorqueuse' as const,
        sousType: 'remorque_seule' as const,
        statut: formData.statut,
        dateMiseEnCirculation: formData.dateMiseEnCirculation,
        photo: formData.photo || undefined,
        proprietaireId: formData.proprietaireId || undefined,
        chauffeurId: formData.chauffeurId || undefined,
      };
      await withGuard(async () => {
        try {
          if (editingTruck) {
            await updateTruck(editingTruck.id, truckData);
            toast.success('Camion modifié avec succès');
          } else {
            await createTruck(truckData);
            toast.success('Camion ajouté avec succès');
          }
          setIsDialogOpen(false);
          resetForm();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
        }
      });
      return;
    }

    const tracteurImmat = formData.immatriculation.trim().toUpperCase().replace(/\s+/g, '');
    const remorqueImmat = formData.remorqueImmatriculation
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    const isJumele = formData.sousType === 'tracteur_jumele';

    if (!tracteurImmat) {
      toast.error("L'immatriculation du tracteur est obligatoire.");
      return;
    }
    if (isJumele && !remorqueImmat) {
      toast.error("Renseigne l'immatriculation de la remorque pour un tracteur avec remorque.");
      return;
    }

    /** En jumelé : envoyer uniquement la plaque tracteur ; le backend compose `tracteur-remorque` (évite double concaténation). */
    const truckData = {
      immatriculation: tracteurImmat,
      remorqueImmatriculation: isJumele ? remorqueImmat : undefined,
      modele: formData.modele,
      type: 'tracteur' as const,
      sousType: isJumele ? ('tracteur_jumele' as const) : ('tracteur_seul' as const),
      statut: formData.statut,
      dateMiseEnCirculation: formData.dateMiseEnCirculation,
      photo: formData.photo || undefined,
      proprietaireId: formData.proprietaireId || undefined,
      chauffeurId: formData.chauffeurId || undefined,
    };
    await withGuard(async () => {
      try {
        if (editingTruck) {
          await updateTruck(editingTruck.id, truckData);
          toast.success('Camion modifié avec succès');
        } else {
          await createTruck(truckData);
          toast.success('Camion ajouté avec succès');
        }
        setIsDialogOpen(false);
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      }
    });
  };

  const handleEdit = (truck: Truck) => {
    setEditingTruck(truck);
    const sousTracteur =
      truck.type === 'tracteur'
        ? (truck.sousType ?? (truck.remorqueImmatriculation ? 'tracteur_jumele' : 'tracteur_seul'))
        : 'remorque_seule';
    setFormData({
      immatriculation:
        truck.type === 'tracteur' ? tracteurImmatForForm(truck) : truck.immatriculation,
      remorqueImmatriculation: truck.remorqueImmatriculation || '',
      modele: truck.modele,
      type: truck.type,
      sousType: sousTracteur,
      statut: truck.statut,
      dateMiseEnCirculation: truck.dateMiseEnCirculation,
      photo: truck.photo || '',
      proprietaireId: truck.proprietaireId || '',
      chauffeurId: truck.chauffeurId || '',
    });
    setPhotoPreview(truck.photo || '');
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    // Vérifier si le camion est utilisé dans un trajet actif
    if (isTruckInUse(id, trips, parcelExpeditions)) {
      toast.error('Impossible de supprimer ce camion : il est utilisé dans une mission en cours ou planifiée');
      return;
    }

    // Calculer les statistiques avant suppression
    const stats = calculateTruckStats(id, trips, expenses, invoices, parcelExpeditions, clientDeliveries);
    
    if (confirm(
      `Êtes-vous sûr de vouloir supprimer ce camion ?\n\n` +
      `Statistiques :\n` +
      `- ${stats.tripsCount} mission(s) terminée(s)${stats.tripsCancelledCount > 0 ? `, ${stats.tripsCancelledCount} annulée(s)` : ''}\n` +
      `- ${stats.revenue.toLocaleString('fr-FR')} FCFA d’encaissement\n` +
      `- ${stats.expenses.toLocaleString('fr-FR')} FCFA de dépenses\n\n` +
      `Toutes les dépenses associées seront également supprimées.`
    )) {
      try {
        // Supprimer les dépenses associées via l'API
        const expensesToDelete = expenses.filter(e => e.camionId === id);
        for (const exp of expensesToDelete) {
          await deleteExpense(exp.id);
        }
        await deleteTruck(id);
        toast.success('Camion et dépenses associées supprimés');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
      }
    }
  };

  // Calculer les statistiques pour chaque camion
  const trucksWithStats = trucks.map(truck => {
    const stats = calculateTruckStats(truck.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries);
    return { truck, stats };
  });

  const filteredTrucks = trucksWithStats
    .filter(({ truck, stats }) => {
      // Recherche générale
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesImmatriculation = truck.immatriculation.toLowerCase().includes(search);
        const matchesModele = truck.modele?.toLowerCase().includes(search);
        const matchesProprietaire = truck.proprietaireId ? (thirdParties.find(tp => tp.id === truck.proprietaireId)?.nom || '').toLowerCase().includes(search) : false;
        
        if (!matchesImmatriculation && !matchesModele && !matchesProprietaire) {
          return false;
        }
      }
      
      // Filtre par type (catégorie)
      if (filterType !== 'all' && truck.type !== filterType) return false;
      
      // Filtre par statut
      if (filterStatus !== 'all' && truck.statut !== filterStatus) return false;
      
      // Filtre par propriétaire
      if (filterProprietaire !== 'all') {
        if (filterProprietaire === 'none' && truck.proprietaireId) return false;
        if (filterProprietaire !== 'none' && truck.proprietaireId !== filterProprietaire) return false;
      }
      
      // Filtre par modèle
      if (filterModele !== 'all' && truck.modele !== filterModele) return false;
      
      // Filtre par nombre de trajets
      if (filterMinTrips && stats.tripsCount < parseInt(filterMinTrips)) return false;
      if (filterMaxTrips && stats.tripsCount > parseInt(filterMaxTrips)) return false;
      
      // Filtre par chiffre d’affaires
      if (filterMinRecettes && stats.revenue < parseFloat(filterMinRecettes)) return false;
      if (filterMaxRecettes && stats.revenue > parseFloat(filterMaxRecettes)) return false;
      
      // Filtre par dépenses
      if (filterMinDepenses && stats.expenses < parseFloat(filterMinDepenses)) return false;
      if (filterMaxDepenses && stats.expenses > parseFloat(filterMaxDepenses)) return false;
      
      return true;
    })
    .map(({ truck }) => truck);

  const sortedTrucks = useMemo(() => {
    const list = [...filteredTrucks];
    const stats = (id: string) => calculateTruckStats(id, trips, expenses, invoices, parcelExpeditions, clientDeliveries);
    switch (listSort) {
      case 'immat_desc':
        return stableSort(list, (a, b) => frCollator.compare(b.immatriculation, a.immatriculation));
      case 'modele_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.modele || '', b.modele || ''));
      case 'modele_desc':
        return stableSort(list, (a, b) => frCollator.compare(b.modele || '', a.modele || ''));
      case 'circ_desc':
        return stableSort(list, (a, b) => parseDateMs(b.dateMiseEnCirculation) - parseDateMs(a.dateMiseEnCirculation));
      case 'circ_asc':
        return stableSort(list, (a, b) => parseDateMs(a.dateMiseEnCirculation) - parseDateMs(b.dateMiseEnCirculation));
      case 'recette_desc':
        return stableSort(list, (a, b) => stats(b.id).revenue - stats(a.id).revenue);
      case 'recette_asc':
        return stableSort(list, (a, b) => stats(a.id).revenue - stats(b.id).revenue);
      case 'depense_desc':
        return stableSort(list, (a, b) => stats(b.id).expenses - stats(a.id).expenses);
      case 'depense_asc':
        return stableSort(list, (a, b) => stats(a.id).expenses - stats(b.id).expenses);
      case 'immat_asc':
      default:
        return stableSort(list, (a, b) => frCollator.compare(a.immatriculation, b.immatriculation));
    }
  }, [filteredTrucks, listSort, trips, expenses, invoices]);

  const activeTrucks = trucks.filter(t => t.statut === 'actif').length;
  const tracteurs = trucks.filter(t => t.type === 'tracteur').length;
  const jumeles = countTracteursJumeles(trucks);
  const remorques = countRemorquesForFleetStats(trucks);

  // Fonction pour générer la description des filtres
  const getFiltersDescription = () => {
    const filters: string[] = [];
    if (searchTerm) filters.push(`Recherche: "${searchTerm}"`);
    if (filterType !== 'all') filters.push(`Type: ${filterType === 'tracteur' ? 'Tracteur' : 'Remorque'}`);
    if (filterStatus !== 'all') filters.push(`Statut: ${filterStatus === 'actif' ? 'Actif' : 'Inactif'}`);
    if (filterProprietaire !== 'all') {
      if (filterProprietaire === 'none') filters.push('Propriétaire: Aucun');
      else filters.push(`Propriétaire: ${thirdParties.find(tp => tp.id === filterProprietaire)?.nom || ''}`);
    }
    if (filterModele !== 'all') filters.push(`Modèle: ${filterModele}`);
    if (filterMinTrips) filters.push(`Min trajets: ${filterMinTrips}`);
    if (filterMaxTrips) filters.push(`Max trajets: ${filterMaxTrips}`);
    if (filterMinRecettes) filters.push(`Min chiffre d’affaires: ${filterMinRecettes} FCFA`);
    if (filterMaxRecettes) filters.push(`Max chiffre d’affaires: ${filterMaxRecettes} FCFA`);
    if (filterMinDepenses) filters.push(`Min dépenses: ${filterMinDepenses} FCFA`);
    if (filterMaxDepenses) filters.push(`Max dépenses: ${filterMaxDepenses} FCFA`);
    const sortLabel = TRUCK_SORT_OPTIONS.find((o) => o.value === listSort)?.label;
    if (sortLabel) filters.push(`Tri: ${sortLabel}`);
    return filters.length > 0 ? `Filtres appliqués: ${filters.join(', ')}` : sortLabel ? `Tri: ${sortLabel}` : undefined;
  };

  // Fonctions d'export
  const handleExportExcel = () => {
    exportToExcel({
      title: 'Liste des Camions',
      fileName: `camions_${new Date().toISOString().split('T')[0]}.xlsx`,
      filtersDescription: getFiltersDescription(),
      columns: [
        { header: 'Immatriculation tracteur', value: exportTracteurImmat },
        { header: 'Immatriculation remorque', value: exportRemorqueImmat },
        { header: 'Chauffeur attitré', value: (t) => {
          const chauffeur = t.chauffeurId ? drivers.find(d => d.id === t.chauffeurId) : null;
          return chauffeur ? `${chauffeur.prenom} ${chauffeur.nom}` : '-';
        }},
        { header: 'Propriétaire', value: (t) => t.proprietaireId ? (thirdParties.find(tp => tp.id === t.proprietaireId)?.nom || '-') : '-' },
        { header: 'Trajets terminés', value: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).tripsCount },
        { header: 'Trajets annulés', value: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).tripsCancelledCount },
        { header: 'Chiffre d’affaires (FCFA)', value: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).revenue },
        { header: 'Dépenses (FCFA)', value: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).expenses },
        { header: 'Bénéfice (FCFA)', value: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).profit },
        { header: 'Mise en circulation', value: (t) => new Date(t.dateMiseEnCirculation).toLocaleDateString('fr-FR') },
      ],
      rows: sortedTrucks,
    });
    toast.success('Export Excel généré avec succès');
  };

  const handleExportPDF = () => {
    // Calculer les totaux
    const totalRecettes = sortedTrucks.reduce((sum, t) => sum + calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).revenue, 0);
    const totalDepenses = sortedTrucks.reduce((sum, t) => sum + calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).expenses, 0);
    const totalBenefice = totalRecettes - totalDepenses;
    const totalTrajetsTermines = sortedTrucks.reduce((sum, t) => sum + calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).tripsCount, 0);
    const totalTrajetsAnnules = sortedTrucks.reduce((sum, t) => sum + calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).tripsCancelledCount, 0);

    exportToPrintablePDF({
      title: 'Liste des Camions',
      fileName: `camions_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: getFiltersDescription(),
      // Couleurs thématiques pour les camions (orange/rouge)
      headerColor: '#ea580c',
      headerTextColor: '#ffffff',
      evenRowColor: '#fff7ed',
      oddRowColor: '#ffffff',
      accentColor: '#ea580c',
      totals: [
        { label: 'Trajets terminés', value: totalTrajetsTermines, style: 'neutral', icon: '🚛' },
        { label: 'Trajets annulés', value: totalTrajetsAnnules, style: totalTrajetsAnnules > 0 ? 'negative' : 'neutral', icon: '❌' },
        { label: 'Chiffre d’affaires', value: `+${totalRecettes.toLocaleString('fr-FR')} FCFA`, style: 'positive', icon: '💰' },
        { label: 'Total Dépenses', value: `-${totalDepenses.toLocaleString('fr-FR')} FCFA`, style: 'negative', icon: '💸' },
        { label: 'Bénéfice Net', value: `${totalBenefice >= 0 ? '+' : ''}${totalBenefice.toLocaleString('fr-FR')} FCFA`, style: totalBenefice >= 0 ? 'positive' : 'negative', icon: '📊' },
      ],
      columns: [
        { header: 'Immat. tracteur', value: exportTracteurImmat },
        { header: 'Immat. remorque', value: exportRemorqueImmat },
        { header: 'Modèle', value: (t) => t.modele },
        { header: 'Type', value: (t) => labelTruckType(t) },
        { header: 'Statut', value: (t) => t.statut === 'actif' ? `${EMOJI.succes} Actif` : `${EMOJI.inactif} Inactif` },
        { header: 'Chauffeur attitré', value: (t) => {
          const chauffeur = t.chauffeurId ? drivers.find(d => d.id === t.chauffeurId) : null;
          return chauffeur ? `👤 ${chauffeur.prenom} ${chauffeur.nom}` : '-';
        }},
        { header: 'Propriétaire', value: (t) => t.proprietaireId ? (thirdParties.find(tp => tp.id === t.proprietaireId)?.nom || '-') : '-' },
        { header: 'Trajets terminés', value: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).tripsCount },
        { header: 'Trajets annulés', value: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).tripsCancelledCount },
        { 
          header: 'Chiffre d’affaires (FCFA)', 
          value: (t) => `+${calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).revenue.toLocaleString('fr-FR')}`,
          cellStyle: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).revenue > 0 ? 'positive' : 'neutral'
        },
        { 
          header: 'Dépenses (FCFA)', 
          value: (t) => `-${calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).expenses.toLocaleString('fr-FR')}`,
          cellStyle: (t) => calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).expenses > 0 ? 'negative' : 'neutral'
        },
        { 
          header: 'Bénéfice (FCFA)', 
          value: (t) => {
            const profit = calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).profit;
            return profit >= 0 ? `+${profit.toLocaleString('fr-FR')}` : profit.toLocaleString('fr-FR');
          },
          cellStyle: (t) => {
            const profit = calculateTruckStats(t.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries).profit;
            return profit >= 0 ? 'positive' : 'negative';
          }
        },
      ],
      rows: sortedTrucks,
    });
  };

  return (
    <div className="space-y-6 p-1">
      {/* En-tête professionnel */}
      <PageHeader
        title="Gestion de la Flotte"
        icon={TruckIcon}
        gradient="from-orange-500/20 via-red-500/10 to-transparent"
        stats={[
          {
            label: 'Total',
            value: trucks.length,
            icon: <TruckIcon className="h-4 w-4" />,
            color: 'text-blue-600 dark:text-blue-400'
          },
          {
            label: 'Actifs',
            value: activeTrucks,
            icon: <TruckIcon className="h-4 w-4" />,
            color: 'text-green-600 dark:text-green-400'
          },
          {
            label: 'Tracteurs',
            value: tracteurs,
            icon: <TruckIcon className="h-4 w-4" />,
            color: 'text-orange-600 dark:text-orange-400'
          },
          {
            label: 'Jumelés',
            value: jumeles,
            icon: <Link2 className="h-4 w-4" />,
            color: 'text-amber-600 dark:text-amber-400'
          },
          {
            label: 'Remorques (fiches + jumelées)',
            value: remorques,
            icon: <TruckIcon className="h-4 w-4" />,
            color: 'text-purple-600 dark:text-purple-400'
          }
        ]}
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
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              {canManageFleet && (
              <DialogTrigger asChild>
                <Button className="shadow-md hover:shadow-lg transition-all duration-300 shrink-0">
                  <Plus className="mr-1.5 h-4 w-4 sm:mr-2 shrink-0" />
                  <span className="hidden sm:inline">Ajouter un camion</span>
                  <span className="sm:hidden">Ajouter</span>
                </Button>
              </DialogTrigger>
              )}
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle>{editingTruck ? 'Modifier le camion' : 'Ajouter un camion'}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="immatriculation">
                    Immatriculation {formData.type === 'remorqueuse' ? 'remorque (historique)' : 'tracteur'}
                  </Label>
                  <Input
                    id="immatriculation"
                    value={formData.immatriculation}
                    onChange={(e) => setFormData({ ...formData, immatriculation: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="modele">Modèle</Label>
                  <Input
                    id="modele"
                    value={formData.modele}
                    onChange={(e) => setFormData({ ...formData, modele: e.target.value })}
                    required
                  />
                </div>
                {formData.type === 'remorqueuse' && (
                  <p className="text-xs text-muted-foreground">
                    Cette fiche est une <span className="font-medium">remorque seule</span> (historique). Désormais, la flotte est gérée en
                    <span className="font-medium"> tracteur seul</span> ou <span className="font-medium">tracteur + remorque</span>.
                  </p>
                )}
                {formData.type === 'tracteur' && (
                  <>
                    <div>
                      <Label htmlFor="sousType">Sous-type tracteur</Label>
                      <Select
                        value={formData.sousType}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            sousType: value as TruckSousType,
                            remorqueImmatriculation:
                              value === 'tracteur_jumele' ? prev.remorqueImmatriculation : '',
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tracteur_seul">Tracteur seul</SelectItem>
                          <SelectItem value="tracteur_jumele">Tracteur jumelé à remorque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.sousType === 'tracteur_jumele' && (
                      <div>
                        <Label htmlFor="remorqueImmatriculation">Immatriculation remorque</Label>
                        <Input
                          id="remorqueImmatriculation"
                          value={formData.remorqueImmatriculation}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              remorqueImmatriculation: e.target.value.toUpperCase(),
                            })
                          }
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Format enregistré : {formData.immatriculation || 'TRACTEUR'}-{formData.remorqueImmatriculation || 'REMORQUE'}
                        </p>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <Label htmlFor="statut">Statut</Label>
                  <Select value={formData.statut} onValueChange={(value) => setFormData({ ...formData, statut: value as TruckStatus })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="actif">Actif</SelectItem>
                      <SelectItem value="inactif">Inactif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="date">Date de mise en circulation</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.dateMiseEnCirculation}
                    onChange={(e) => setFormData({ ...formData, dateMiseEnCirculation: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="proprietaire">
                    Propriétaire
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({thirdParties?.filter(tp => tp.type === 'proprietaire').length || 0} disponible{(thirdParties?.filter(tp => tp.type === 'proprietaire').length || 0) > 1 ? 's' : ''})
                    </span>
                  </Label>
                  <Select 
                    value={formData.proprietaireId || 'none'} 
                    onValueChange={(value) => setFormData({ ...formData, proprietaireId: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un propriétaire (optionnel)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun propriétaire</SelectItem>
                      {thirdParties
                        ?.filter(tp => tp.type === 'proprietaire' && tp.nom && tp.nom.trim() !== '' && tp.id && tp.id.trim() !== '')
                        .map(tp => tp.id ? (
                          <SelectItem key={tp.id} value={tp.id}>
                            {tp.nom}
                          </SelectItem>
                        ) : null)}
                      {(!thirdParties || thirdParties.filter(tp => tp.type === 'proprietaire' && tp.nom && tp.id).length === 0) && (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <p className="mb-2">Aucun propriétaire enregistré</p>
                          <p className="text-xs">Créez un propriétaire dans la section "Tiers"</p>
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Les propriétaires sont gérés dans la section "Tiers"
                  </p>
                </div>
                <div>
                  <Label htmlFor="chauffeur">
                    Chauffeur attitré
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({drivers?.length || 0} disponible{(drivers?.length || 0) > 1 ? 's' : ''})
                    </span>
                  </Label>
                  <Select 
                    value={formData.chauffeurId || 'none'} 
                    onValueChange={(value) => setFormData({ ...formData, chauffeurId: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un chauffeur" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun chauffeur</SelectItem>
                      {drivers
                        ?.filter(d => d.nom && d.prenom && d.id)
                        .map(driver => {
                          // Vérifier si ce chauffeur est déjà attitré à un autre camion
                          const alreadyAssigned = trucks.some(t => 
                            t.chauffeurId === driver.id && 
                            t.id !== editingTruck?.id
                          );
                          return (
                            <SelectItem 
                              key={driver.id} 
                              value={driver.id}
                              disabled={alreadyAssigned}
                            >
                              {driver.prenom} {driver.nom}
                              {alreadyAssigned && ' (déjà attitré)'}
                            </SelectItem>
                          );
                        })}
                      {(!drivers || drivers.length === 0) && (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <p className="mb-2">Aucun chauffeur enregistré</p>
                          <p className="text-xs">Créez un chauffeur dans la section "Chauffeurs"</p>
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Le chauffeur attitré est fixe pour ce camion
                  </p>
                </div>
                <div>
                  <Label htmlFor="photo">Photo du camion</Label>
                  <Input
                    id="photo"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="cursor-pointer"
                  />
                  {photoPreview && (
                    <div className="mt-3">
                      <img 
                        src={photoPreview} 
                        alt="Aperçu" 
                        className="w-full h-48 rounded-lg object-cover border-2 border-primary"
                      />
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</> : (editingTruck ? 'Modifier' : 'Ajouter')}
                </Button>
              </form>
              </div>
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
            {(searchTerm || filterType !== 'all' || filterStatus !== 'all' || filterProprietaire !== 'all' || filterModele !== 'all' || 
              filterMinTrips || filterMaxTrips || filterMinRecettes || filterMaxRecettes || filterMinDepenses || filterMaxDepenses) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('all');
                  setFilterStatus('all');
                  setFilterProprietaire('all');
                  setFilterModele('all');
                  setFilterMinTrips('');
                  setFilterMaxTrips('');
                  setFilterMinRecettes('');
                  setFilterMaxRecettes('');
                  setFilterMinDepenses('');
                  setFilterMaxDepenses('');
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
            {/* Recherche générale */}
            <div className="min-w-0">
              <Label htmlFor="search-trucks" className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0" />
                Recherche générale
              </Label>
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-trucks"
                  placeholder="Rechercher (immat., modèle, propriétaire)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 min-w-0 w-full"
                />
              </div>
            </div>

            <ListSortSelect
              id="sort-trucks"
              value={listSort}
              onChange={setListSort}
              options={[...TRUCK_SORT_OPTIONS]}
            />
          
            {/* Filtres actifs */}
            {(filterType !== 'all' || filterStatus !== 'all' || filterProprietaire !== 'all' || filterModele !== 'all' || 
              filterMinTrips || filterMaxTrips || filterMinRecettes || filterMaxRecettes || filterMinDepenses || filterMaxDepenses) && (
              <div className="flex flex-wrap gap-2 pb-2">
                {filterType !== 'all' && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                    Type: {filterType === 'tracteur' ? 'Tracteur' : 'Remorque'}
                    <button
                      onClick={() => setFilterType('all')}
                      className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                      aria-label="Retirer le filtre type"
                      title="Retirer le filtre type"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filterStatus !== 'all' && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                    Statut: {filterStatus === 'actif' ? 'Actif' : 'Inactif'}
                    <button
                      onClick={() => setFilterStatus('all')}
                      className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                      aria-label="Retirer le filtre statut"
                      title="Retirer le filtre statut"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filterProprietaire !== 'all' && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                    {filterProprietaire === 'none' ? 'Sans propriétaire' : (thirdParties.find(tp => tp.id === filterProprietaire)?.nom || 'Propriétaire')}
                    <button
                      onClick={() => setFilterProprietaire('all')}
                      className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                      aria-label="Retirer le filtre propriétaire"
                      title="Retirer le filtre propriétaire"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filterModele !== 'all' && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                    Modèle: {filterModele}
                    <button
                      onClick={() => setFilterModele('all')}
                      className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                      aria-label="Retirer le filtre modèle"
                      title="Retirer le filtre modèle"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
              </div>
            )}

            {/* Première ligne de filtres */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Catégorie (Type)</Label>
          <Select value={filterType} onValueChange={(value) => setFilterType(value as TruckType | 'all')}>
                <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="tracteur">Tracteur</SelectItem>
              <SelectItem value="remorqueuse">Remorque</SelectItem>
            </SelectContent>
          </Select>
            </div>

            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Statut</Label>
          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as TruckStatus | 'all')}>
                <SelectTrigger>
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="actif">Actif</SelectItem>
              <SelectItem value="inactif">Inactif</SelectItem>
            </SelectContent>
          </Select>
            </div>

            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Propriétaire</Label>
              <Select value={filterProprietaire} onValueChange={setFilterProprietaire}>
                <SelectTrigger>
                  <SelectValue placeholder="Propriétaire" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les propriétaires</SelectItem>
                  <SelectItem value="none">Aucun propriétaire</SelectItem>
                  {thirdParties
                    ?.filter(tp => tp.type === 'proprietaire' && tp.nom && tp.nom.trim() !== '' && tp.id && tp.id.trim() !== '')
                    .map(tp => tp.id ? (
                      <SelectItem key={tp.id} value={tp.id}>
                        {tp.nom}
                      </SelectItem>
                    ) : null)}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Modèle</Label>
              <Select value={filterModele} onValueChange={setFilterModele}>
                <SelectTrigger>
                  <SelectValue placeholder="Modèle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les modèles</SelectItem>
                  {Array.from(new Set(trucks.map(t => t.modele).filter(Boolean))).filter(modele => modele && modele.trim() !== '').map(modele => modele ? (
                    <SelectItem key={modele} value={modele}>
                      {modele}
                    </SelectItem>
                  ) : null)}
                </SelectContent>
              </Select>
            </div>
          </div>

            {/* Deuxième ligne - Filtres numériques */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-2 border-t">
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Trajets (Min)</Label>
              <Input
                type="number"
                placeholder="Min"
                value={filterMinTrips}
                onChange={(e) => setFilterMinTrips(e.target.value)}
                min="0"
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Trajets (Max)</Label>
              <Input
                type="number"
                placeholder="Max"
                value={filterMaxTrips}
                onChange={(e) => setFilterMaxTrips(e.target.value)}
                min="0"
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Chiffre d’affaires (min) FCFA</Label>
              <Input
                type="number"
                placeholder="Min"
                value={filterMinRecettes}
                onChange={(e) => setFilterMinRecettes(e.target.value)}
                min="0"
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Chiffre d’affaires (max) FCFA</Label>
              <Input
                type="number"
                placeholder="Max"
                value={filterMaxRecettes}
                onChange={(e) => setFilterMaxRecettes(e.target.value)}
                min="0"
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Dépenses (Min) FCFA</Label>
              <Input
                type="number"
                placeholder="Min"
                value={filterMinDepenses}
                onChange={(e) => setFilterMinDepenses(e.target.value)}
                min="0"
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground mb-1">Dépenses (Max) FCFA</Label>
              <Input
                type="number"
                placeholder="Max"
                value={filterMaxDepenses}
                onChange={(e) => setFilterMaxDepenses(e.target.value)}
                min="0"
              />
            </div>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Indicateur de résultats filtrés */}
      {(filterType !== 'all' || filterStatus !== 'all' || filterProprietaire !== 'all' || filterModele !== 'all' || 
        filterMinTrips || filterMaxTrips || filterMinRecettes || filterMaxRecettes || filterMinDepenses || filterMaxDepenses) && (
        <div className="bg-muted/50 rounded-lg px-4 py-2 border border-primary/10">
          <p className="text-sm font-medium text-primary">
            <span className="font-bold">{filteredTrucks.length}</span> camion(s) trouvé(s) sur {trucks.length}
          </p>
        </div>
      )}

      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20">
          <CardTitle className="flex items-center gap-2">
            {EMOJI.camion} Liste des Camions {filteredTrucks.length !== trucks.length && `(${filteredTrucks.length} résultat${filteredTrucks.length > 1 ? 's' : ''})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Immatriculation</TableHead>
                <TableHead>Modèle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Chauffeur attitré</TableHead>
                <TableHead>Propriétaire</TableHead>
                <TableHead className="whitespace-normal min-w-[7rem]">Trajets</TableHead>
                <TableHead>Mise en circulation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTrucks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Aucun camion ne correspond aux critères de filtrage sélectionnés
                  </TableCell>
                </TableRow>
              ) : (
                sortedTrucks.map((truck) => (
                <TableRow key={truck.id} className="hover:bg-muted/50 transition-colors duration-200">
                  <TableCell className="font-semibold">{truck.immatriculation}</TableCell>
                  <TableCell>{truck.modele}</TableCell>
                  <TableCell>{labelTruckType(truck)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge 
                        variant={truck.statut === 'actif' ? 'default' : 'secondary'}
                        className={truck.statut === 'actif' ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' : ''}
                      >
                        {truck.statut}
                      </Badge>
                      {isTruckInUse(truck.id, trips, parcelExpeditions) && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 text-xs">
                          Indisponible
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {truck.chauffeurId ? (
                      <div className="flex items-center gap-2">
                        {(() => {
                          const chauffeur = drivers?.find(d => d.id === truck.chauffeurId);
                          return chauffeur ? (
                            <>
                              {chauffeur.photo && (
                                <img 
                                  src={chauffeur.photo} 
                                  alt={`${chauffeur.prenom} ${chauffeur.nom}`}
                                  className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/20"
                                />
                              )}
                              <span className="text-sm font-medium">
                                {chauffeur.prenom} {chauffeur.nom}
                              </span>
                            </>
                          ) : <span className="text-sm text-muted-foreground">-</span>;
                        })()}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Non attitré</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {truck.proprietaireId ? (
                      <span className="text-sm">
                        {thirdParties?.find(tp => tp.id === truck.proprietaireId)?.nom || '-'}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const st = calculateTruckStats(truck.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries);
                      return (
                        <div className="flex flex-col gap-0.5 text-sm">
                          <div className="flex items-center gap-2">
                            <Route className="h-4 w-4 text-primary shrink-0" />
                            <span>
                              <span className="font-semibold text-primary tabular-nums">{st.tripsCount}</span>
                              <span className="text-xs text-muted-foreground ml-1">terminé{st.tripsCount !== 1 ? 's' : ''}</span>
                            </span>
                          </div>
                          {st.tripsCancelledCount > 0 && (
                            <span className="text-xs text-red-600 dark:text-red-400 pl-6 tabular-nums">
                              {st.tripsCancelledCount} annulé{st.tripsCancelledCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{new Date(truck.dateMiseEnCirculation).toLocaleDateString('fr-FR')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {truck.photo && (
                        <Button size="sm" variant="outline" onClick={() => setViewingTruck(truck)} className="hover:shadow-md transition-all duration-200">
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {canManageFleet && (
                      <>
                      <Button size="sm" variant="outline" onClick={() => handleEdit(truck)} className="hover:shadow-md transition-all duration-200">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(truck.id)} className="hover:shadow-md transition-all duration-200">
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
        </CardContent>
      </Card>

      {/* Dialog de visualisation de la photo */}
      <Dialog open={!!viewingTruck} onOpenChange={(open) => !open && setViewingTruck(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Photo du camion - {viewingTruck?.immatriculation}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {viewingTruck?.photo && (
              <div className="relative w-full">
                <img 
                  src={viewingTruck.photo} 
                  alt={`Camion ${viewingTruck.immatriculation}`}
                  className="w-full h-auto rounded-lg object-contain max-h-[70vh] border-2 border-border"
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Immatriculation</p>
                <p className="text-lg font-semibold">{viewingTruck?.immatriculation}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Modèle</p>
                <p className="text-lg font-semibold">{viewingTruck?.modele}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Type</p>
                <p className="text-lg font-semibold">
                  {viewingTruck ? labelTruckType(viewingTruck) : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Chauffeur attitré</p>
                {viewingTruck?.chauffeurId ? (
                  <div className="flex items-center gap-2 mt-1">
                    {(() => {
                      const chauffeur = drivers?.find(d => d.id === viewingTruck.chauffeurId);
                      return chauffeur ? (
                        <>
                          {chauffeur.photo && (
                            <img 
                              src={chauffeur.photo} 
                              alt={`${chauffeur.prenom} ${chauffeur.nom}`}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20"
                            />
                          )}
                          <span className="text-lg font-semibold">
                            {chauffeur.prenom} {chauffeur.nom}
                          </span>
                        </>
                      ) : <span className="text-muted-foreground">-</span>;
                    })()}
                  </div>
                ) : (
                  <p className="text-lg font-semibold text-muted-foreground">Non attitré</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Propriétaire</p>
                <p className="text-lg font-semibold">
                  {viewingTruck?.proprietaireId 
                    ? (thirdParties?.find(tp => tp.id === viewingTruck.proprietaireId)?.nom || '-')
                    : <span className="text-muted-foreground">Aucun</span>
                  }
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Statut</p>
                <div className="flex flex-col gap-1 mt-1">
                  <Badge variant={viewingTruck?.statut === 'actif' ? 'default' : 'secondary'}>
                    {viewingTruck?.statut}
                  </Badge>
                  {viewingTruck && isTruckInUse(viewingTruck.id, trips, parcelExpeditions) && (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 text-xs">
                      Indisponible
                    </Badge>
                  )}
                </div>
              </div>
              {viewingTruck && (() => {
                const stats = calculateTruckStats(viewingTruck.id, trips, expenses, invoices, parcelExpeditions, clientDeliveries);
                return (
                  <div className="col-span-2 space-y-3">
                    {/* Statistiques principales */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-4 border border-primary/20">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/20 rounded-lg">
                            <Route className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-muted-foreground">Trajets terminés</p>
                            <p className="text-2xl font-bold text-primary">
                              {stats.tripsCount}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className={`rounded-lg p-4 border ${stats.tripsCancelledCount > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : 'bg-muted/30 border-border'}`}>
                        <p className="text-sm font-medium text-muted-foreground">Trajets annulés</p>
                        <p className={`text-2xl font-bold ${stats.tripsCancelledCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}>
                          {stats.tripsCancelledCount}
                        </p>
                      </div>
                    </div>

                    {/* Chiffre d’affaires — section dédiée */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-4 border-2 border-green-200 dark:border-green-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-200 dark:bg-green-900 rounded-lg">
                            <DollarSign className="h-5 w-5 text-green-700 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-green-700 dark:text-green-400">Chiffre d’affaires</p>
                            <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                              {stats.revenue.toLocaleString('fr-FR')} FCFA
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Encaissement généré par ce camion
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dépenses et bénéfice */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                        <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Dépenses</p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-400">
                          {stats.expenses.toLocaleString('fr-FR')} FCFA
                        </p>
                      </div>
                      <div className={`rounded-lg p-3 border ${stats.profit >= 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'}`}>
                        <p className={`text-xs font-medium mb-1 ${stats.profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400'}`}>
                          Bénéfice net
                        </p>
                        <p className={`text-lg font-bold ${stats.profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400'}`}>
                          {stats.profit.toLocaleString('fr-FR')} FCFA
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
