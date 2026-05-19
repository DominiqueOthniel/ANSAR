import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useApp, Expense, Invoice } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Filter, DollarSign, TrendingDown, Receipt, FileText, X, Truck, Tag, Search, User, FileDown, Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import PageHeader from '@/components/PageHeader';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { PAGE_DEPENSES_DESCRIPTION } from '@/lib/metier-activite';
import { useAuth } from '@/contexts/AuthContext';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { EMOJI } from '@/lib/emoji-palette';
import { removeCaisseLienDepense, upsertSortieFromExpense } from '@/lib/caisse-local';
import { frCollator, parseDateMs, stableSort } from '@/lib/list-sort';
import { ListSortSelect } from '@/components/ListSortSelect';
import {
  getArticleSupplierUnitPrice,
  listArticlesForSupplier,
} from '@/lib/article-pricing';

const categories = ['Carburant', 'Maintenance', 'Péage', 'Assurance', 'Salaire', 'Don', 'Autre'];

const EXPENSE_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (récent → ancien)' },
  { value: 'date_asc', label: 'Date (ancien → récent)' },
  { value: 'montant_desc', label: 'Montant (plus haut → plus bas)' },
  { value: 'montant_asc', label: 'Montant (plus bas → plus haut)' },
  { value: 'categorie_asc', label: 'Catégorie A → Z' },
  { value: 'categorie_desc', label: 'Catégorie Z → A' },
  { value: 'camion_asc', label: 'Camion A → Z' },
  { value: 'description_asc', label: 'Description A → Z' },
] as const;

/** Numéro facture dépense (aligné sur Factures / dialogue manuel). */
function nextExpenseInvoiceNumero(invoicesList: Invoice[]): string {
  const year = new Date().getFullYear();
  const count = invoicesList.filter((inv) => inv.numero.startsWith(`FAC-EXP-${year}`)).length + 1;
  return `FAC-EXP-${year}-${String(count).padStart(3, '0')}`;
}

function formatSalaireBeneficiaire(
  expense: Expense,
  getDriverLabel: (id?: string) => string,
  tiers: { id: string; nom: string; type: string }[],
): string {
  if (expense.categorie !== 'Salaire') return getDriverLabel(expense.chauffeurId);
  if (expense.chauffeurId) return getDriverLabel(expense.chauffeurId);
  const emp = expense.fournisseurId
    ? tiers.find((tp) => tp.id === expense.fournisseurId && tp.type === 'employe')
    : undefined;
  return emp ? `Personnel siège : ${emp.nom}` : '—';
}

export default function Expenses() {
  const { expenses, trucks, drivers, thirdParties, articles, subCategories, setSubCategories, invoices, trips, createExpense, updateExpense, deleteExpense, createInvoice, updateInvoice } = useApp();
  const { canManageAccounting } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedExpenseForInvoice, setSelectedExpenseForInvoice] = useState<Expense | null>(null);
  const { isSubmitting, withGuard } = useSubmitGuard();
  const { isSubmitting: isInvoiceSubmitting, withGuard: withInvoiceGuard } = useSubmitGuard();
  const [newSubCategory, setNewSubCategory] = useState<string>('');
  const [filterCamion, setFilterCamion] = useState<string>('all');
  const [filterCategorie, setFilterCategorie] = useState<string>('all');
  const [filterSousCategorie, setFilterSousCategorie] = useState<string>('all');
  const [filterFournisseur, setFilterFournisseur] = useState<string>('all');
  const [filterChauffeur, setFilterChauffeur] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterMontantMin, setFilterMontantMin] = useState<string>('');
  const [filterMontantMax, setFilterMontantMax] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [listSort, setListSort] = useState<string>('date_desc');

  const employesSiege = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'employe'),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const fournisseursFiches = useMemo(
    () =>
      stableSort(
        thirdParties.filter(
          (tp) =>
            tp.type === 'fournisseur' && tp.nom && tp.nom.trim() !== '' && tp.id && tp.id.trim() !== '',
        ),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const isEmployeTierId = (id?: string) =>
    Boolean(id && thirdParties.some((tp) => tp.id === id && tp.type === 'employe'));

  const [formData, setFormData] = useState({
    camionId: '',
    tripId: '',
    chauffeurId: '',
    categorie: 'Carburant',
    sousCategorie: '',
    fournisseurId: '',
    articleId: '',
    montant: 0,
    quantite: undefined as number | undefined,
    prixUnitaire: undefined as number | undefined,
    date: '',
    description: '',
  });

  const [invoiceFormData, setInvoiceFormData] = useState({
    tva: 0,
    tps: 0,
    notes: '',
  });

  const resetForm = () => {
    setFormData({
      camionId: '',
      tripId: '',
      chauffeurId: '',
      categorie: 'Carburant',
      sousCategorie: '',
      fournisseurId: '',
      articleId: '',
      montant: 0,
      quantite: undefined,
      prixUnitaire: undefined,
      date: '',
      description: '',
    });
    setEditingExpense(null);
    setNewSubCategory('');
  };

  const resetInvoiceForm = () => {
    setInvoiceFormData({
      tva: 0,
      tps: 0,
      notes: '',
    });
    setSelectedExpenseForInvoice(null);
  };

  const handleAddSubCategory = () => {
    if (!newSubCategory.trim() || !formData.categorie) return;
    
    const currentSubs = subCategories[formData.categorie] || [];
    if (!currentSubs.includes(newSubCategory.trim())) {
      setSubCategories({
        ...subCategories,
        [formData.categorie]: [...currentSubs, newSubCategory.trim()],
      });
      setFormData({ ...formData, sousCategorie: newSubCategory.trim() });
      setNewSubCategory('');
      toast.success('Sous-catégorie ajoutée');
    } else {
      toast.error('Cette sous-catégorie existe déjà');
    }
  };

  // Fonction pour obtenir l'unité selon la catégorie
  const getUnite = (categorie: string) => {
    switch (categorie) {
      case 'Carburant':
        return 'Litres';
      case 'Maintenance':
        return 'Pièces';
      case 'Don':
      case 'Salaire':
        return 'FCFA';
      default:
        return 'Unités';
    }
  };

  // Calcul automatique du montant si quantité et prix unitaire sont fournis
  const calculateMontant = (quantite?: number, prixUnitaire?: number) => {
    if (quantite !== undefined && prixUnitaire !== undefined && quantite > 0 && prixUnitaire > 0) {
      return quantite * prixUnitaire;
    }
    return undefined;
  };

  const articlesForFournisseur = useMemo(
    () => listArticlesForSupplier(articles, formData.fournisseurId),
    [articles, formData.fournisseurId],
  );

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === formData.articleId),
    [articles, formData.articleId],
  );

  const getUniteLabel = () => {
    if (selectedArticle?.unite) return selectedArticle.unite;
    return getUnite(formData.categorie);
  };

  const applyArticleTarif = (articleId: string, fournisseurId: string) => {
    const article = articles.find((a) => a.id === articleId);
    const pu = getArticleSupplierUnitPrice(article, fournisseurId);
    if (!article || pu == null) return;
    setFormData((prev) => {
      const calculatedMontant = calculateMontant(prev.quantite, pu);
      return {
        ...prev,
        articleId,
        prixUnitaire: pu,
        description: prev.description.trim() ? prev.description : article.libelle,
        montant: calculatedMontant !== undefined ? calculatedMontant : prev.montant,
      };
    });
    toast.info(`Tarif forfaitaire : ${pu.toLocaleString('fr-FR')} FCFA / ${article.unite}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.categorie === 'Salaire') {
      const hasChauffeur = Boolean(formData.chauffeurId);
      const hasEmploye =
        Boolean(formData.fournisseurId) && isEmployeTierId(formData.fournisseurId);
      if (!hasChauffeur && !hasEmploye) {
        toast.error('Pour une dépense de salaire, sélectionnez un chauffeur ou un employé (personnel siège, fiche Tiers).');
        return;
      }
    }

    let finalMontant = formData.montant;
    if (formData.quantite !== undefined && formData.prixUnitaire !== undefined && 
        formData.quantite > 0 && formData.prixUnitaire > 0) {
      finalMontant = formData.quantite * formData.prixUnitaire;
    }

    let chauffeurPayload = formData.chauffeurId || undefined;
    let fournisseurPayload = formData.fournisseurId || undefined;
    if (formData.categorie === 'Salaire') {
      if (chauffeurPayload) {
        fournisseurPayload = undefined;
      } else {
        chauffeurPayload = undefined;
      }
    }

    const payload = {
      ...(formData.camionId ? { camionId: formData.camionId } : {}),
      tripId: formData.tripId || undefined,
      chauffeurId: chauffeurPayload,
      categorie: formData.categorie,
      sousCategorie: formData.sousCategorie || undefined,
      fournisseurId: fournisseurPayload,
      articleId:
        formData.categorie !== 'Salaire' && formData.articleId ? formData.articleId : undefined,
      montant: finalMontant,
      quantite: formData.quantite,
      prixUnitaire: formData.prixUnitaire,
      date: formData.date,
      description: formData.description,
    };
    await withGuard(async () => {
      try {
        if (editingExpense) {
          const updated = await updateExpense(editingExpense.id, payload);
          await upsertSortieFromExpense({
            id: updated.id,
            montant: updated.montant,
            date: updated.date,
            description: updated.description,
            categorie: updated.categorie,
          });
          const linkedInvoices = invoices.filter((inv) => inv.expenseId === updated.id);
          if (linkedInvoices.length > 0) {
            await Promise.all(
              linkedInvoices.map(async (inv) => {
                const remisePct = inv.remise ?? 0;
                const montantHTApresRemise = updated.montant * (1 - remisePct / 100);
                const baseTax = inv.montantHTApresRemise ?? inv.montantHT;
                const tvaRate = inv.tva && baseTax > 0 ? inv.tva / baseTax : 0;
                const tpsRate = inv.tps && baseTax > 0 ? inv.tps / baseTax : 0;
                const montantTVA = tvaRate > 0 ? montantHTApresRemise * tvaRate : undefined;
                const montantTPS = tpsRate > 0 ? montantHTApresRemise * tpsRate : undefined;
                const montantTTC = montantHTApresRemise + (montantTVA || 0) + (montantTPS || 0);
                const montantPaye = Math.min(inv.montantPaye || 0, montantTTC);
                await updateInvoice(inv.id, {
                  montantHT: updated.montant,
                  remise: remisePct > 0 ? remisePct : undefined,
                  montantHTApresRemise: remisePct > 0 ? montantHTApresRemise : undefined,
                  tva: montantTVA,
                  tps: montantTPS,
                  montantTTC,
                  montantPaye,
                  statut: montantPaye >= montantTTC ? 'payee' : 'en_attente',
                });
              }),
            );
          }
          toast.success('Dépense modifiée');
        } else {
          const created = await createExpense(payload);
          await upsertSortieFromExpense({
            id: created.id,
            montant: created.montant,
            date: created.date,
            description: created.description,
            categorie: created.categorie,
          });
          try {
            await createInvoice({
              numero: nextExpenseInvoiceNumero(invoices),
              expenseId: created.id,
              statut: 'en_attente',
              montantHT: created.montant,
              montantTTC: created.montant,
              montantPaye: 0,
              dateCreation: new Date().toISOString().split('T')[0],
            });
            toast.success('Dépense ajoutée — facture fournisseur créée automatiquement');
          } catch (invErr) {
            console.error(invErr);
            toast.error(
              `Dépense enregistrée, mais la facture automatique a échoué : ${
                invErr instanceof Error ? invErr.message : 'erreur'
              }. Créez la facture depuis l’onglet Factures.`,
            );
          }
        }
        setIsDialogOpen(false);
        resetForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      }
    });
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      camionId: expense.camionId ?? '',
      tripId: expense.tripId || '',
      chauffeurId: expense.chauffeurId || '',
      categorie: expense.categorie,
      sousCategorie: expense.sousCategorie || '',
      fournisseurId: expense.fournisseurId || '',
      articleId: expense.articleId || '',
      montant: expense.montant,
      quantite: expense.quantite,
      prixUnitaire: expense.prixUnitaire,
      date: expense.date,
      description: expense.description,
    });
    setIsDialogOpen(true);
  };

  const handleCreateInvoice = (expense: Expense) => {
    setSelectedExpenseForInvoice(expense);
    setInvoiceFormData({
      tva: 0,
      tps: 0,
      notes: '',
    });
    setIsInvoiceDialogOpen(true);
  };

  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpenseForInvoice) return;

    const montantHT = selectedExpenseForInvoice.montant;
    const tva = montantHT * (invoiceFormData.tva / 100);
    const tps = montantHT * (invoiceFormData.tps / 100);
    const montantTTC = montantHT + tva + tps;

    const numero = nextExpenseInvoiceNumero(invoices);

    await withInvoiceGuard(async () => {
      try {
        await createInvoice({
          numero,
          expenseId: selectedExpenseForInvoice.id,
          statut: 'en_attente',
          montantHT,
          tva: invoiceFormData.tva > 0 ? tva : undefined,
          tps: invoiceFormData.tps > 0 ? tps : undefined,
          montantTTC,
          dateCreation: new Date().toISOString().split('T')[0],
          notes: invoiceFormData.notes || undefined,
        });
        toast.success('Facture créée avec succès');
        setIsInvoiceDialogOpen(false);
        resetInvoiceForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la création');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer cette dépense ?')) {
      try {
        await deleteExpense(id);
        await removeCaisseLienDepense(id);
        toast.success('Dépense supprimée');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
      }
    }
  };

  // Fonctions utilitaires pour les labels (définies avant leur utilisation)
  const getTruckLabel = (id?: string) => {
    if (!id) return '—';
    const truck = trucks.find(t => t.id === id);
    return truck ? truck.immatriculation : '—';
  };

  const getDriverLabel = (id?: string) => {
    if (!id) return '-';
    const driver = drivers.find(d => d.id === id);
    return driver ? `${driver.prenom} ${driver.nom}` : '-';
  };

  const filteredExpenses = expenses.filter(exp => {
    // Filtre par camion
    if (filterCamion !== 'all') {
      if (filterCamion === 'none') {
        if (exp.camionId) return false;
      } else if (exp.camionId !== filterCamion) return false;
    }
    
    // Filtre par catégorie
    if (filterCategorie !== 'all' && exp.categorie !== filterCategorie) return false;
    
    // Filtre par sous-catégorie
    if (filterSousCategorie !== 'all') {
      if (filterSousCategorie === 'none' && exp.sousCategorie) return false;
      if (filterSousCategorie !== 'none' && exp.sousCategorie !== filterSousCategorie) return false;
    }
    
    // Filtre par fournisseur
    if (filterFournisseur !== 'all') {
      if (filterFournisseur === 'none' && exp.fournisseurId) return false;
      if (filterFournisseur !== 'none' && exp.fournisseurId !== filterFournisseur) return false;
    }
    
    // Filtre par chauffeur
    if (filterChauffeur !== 'all') {
      if (filterChauffeur === 'none' && exp.chauffeurId) return false;
      if (filterChauffeur !== 'none' && exp.chauffeurId !== filterChauffeur) return false;
    }
    
    // Filtre par date (du)
    if (filterDateFrom && exp.date < filterDateFrom) return false;
    
    // Filtre par date (au)
    if (filterDateTo && exp.date > filterDateTo) return false;
    
    // Filtre par montant minimum
    if (filterMontantMin && exp.montant < parseFloat(filterMontantMin)) return false;
    
    // Filtre par montant maximum
    if (filterMontantMax && exp.montant > parseFloat(filterMontantMax)) return false;
    
    // Recherche générale
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesDescription = exp.description?.toLowerCase().includes(search);
      const matchesCategorie = exp.categorie.toLowerCase().includes(search);
      const matchesSousCategorie = exp.sousCategorie?.toLowerCase().includes(search);
      const matchesCamion = getTruckLabel(exp.camionId).toLowerCase().includes(search);
      const matchesChauffeur = getDriverLabel(exp.chauffeurId).toLowerCase().includes(search);
      const matchesFournisseur = exp.fournisseurId ? (thirdParties.find(tp => tp.id === exp.fournisseurId)?.nom || '').toLowerCase().includes(search) : false;
      
      if (!matchesDescription && !matchesCategorie && !matchesSousCategorie && !matchesCamion && !matchesChauffeur && !matchesFournisseur) {
        return false;
      }
    }
    
    return true;
  });

  const sortedExpenses = useMemo(() => {
    const list = [...filteredExpenses];
    switch (listSort) {
      case 'date_asc':
        return stableSort(list, (a, b) => parseDateMs(a.date) - parseDateMs(b.date));
      case 'montant_desc':
        return stableSort(list, (a, b) => b.montant - a.montant);
      case 'montant_asc':
        return stableSort(list, (a, b) => a.montant - b.montant);
      case 'categorie_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.categorie, b.categorie));
      case 'categorie_desc':
        return stableSort(list, (a, b) => frCollator.compare(b.categorie, a.categorie));
      case 'camion_asc':
        return stableSort(list, (a, b) => frCollator.compare(getTruckLabel(a.camionId), getTruckLabel(b.camionId)));
      case 'description_asc':
        return stableSort(list, (a, b) => frCollator.compare(a.description || '', b.description || ''));
      case 'date_desc':
      default:
        return stableSort(list, (a, b) => parseDateMs(b.date) - parseDateMs(a.date));
    }
  }, [filteredExpenses, listSort, trucks]);

  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.montant, 0);

  const expensesByCategory = expenses.reduce((acc, exp) => {
    acc[exp.categorie] = (acc[exp.categorie] || 0) + exp.montant;
    return acc;
  }, {} as Record<string, number>);
  
  const topCategory = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1])[0];

  // Fonction pour générer la description des filtres
  const getFiltersDescription = () => {
    const filters: string[] = [];
    if (searchTerm) filters.push(`Recherche: "${searchTerm}"`);
    if (filterCamion !== 'all') {
      filters.push(
        filterCamion === 'none' ? 'Camion: non rattaché' : `Camion: ${getTruckLabel(filterCamion)}`,
      );
    }
    if (filterCategorie !== 'all') filters.push(`Catégorie: ${filterCategorie}`);
    if (filterSousCategorie !== 'all') {
      if (filterSousCategorie === 'none') filters.push('Sous-catégorie: Aucune');
      else filters.push(`Sous-catégorie: ${filterSousCategorie}`);
    }
    if (filterFournisseur !== 'all') {
      if (filterFournisseur === 'none') filters.push('Fournisseur: Aucun');
      else filters.push(`Fournisseur: ${thirdParties.find(tp => tp.id === filterFournisseur)?.nom || ''}`);
    }
    if (filterChauffeur !== 'all') {
      if (filterChauffeur === 'none') filters.push('Chauffeur: Aucun');
      else filters.push(`Chauffeur: ${getDriverLabel(filterChauffeur)}`);
    }
    if (filterDateFrom) filters.push(`Du: ${new Date(filterDateFrom).toLocaleDateString('fr-FR')}`);
    if (filterDateTo) filters.push(`Au: ${new Date(filterDateTo).toLocaleDateString('fr-FR')}`);
    if (filterMontantMin) filters.push(`Min: ${filterMontantMin} FCFA`);
    if (filterMontantMax) filters.push(`Max: ${filterMontantMax} FCFA`);
    const sortLabel = EXPENSE_SORT_OPTIONS.find((o) => o.value === listSort)?.label;
    if (sortLabel) filters.push(`Tri: ${sortLabel}`);
    return filters.length > 0 ? `Filtres appliqués: ${filters.join(', ')}` : sortLabel ? `Tri: ${sortLabel}` : undefined;
  };

  // Fonctions d'export
  const handleExportExcel = () => {
    exportToExcel({
      title: 'Liste des Dépenses',
      fileName: `depenses_${new Date().toISOString().split('T')[0]}.xlsx`,
      filtersDescription: getFiltersDescription(),
      columns: [
        { header: 'Date', value: (e) => new Date(e.date).toLocaleDateString('fr-FR') },
        { header: 'Catégorie', value: (e) => e.categorie },
        { header: 'Sous-catégorie', value: (e) => e.sousCategorie || '-' },
        { header: 'Description', value: (e) => e.description },
        { header: 'Camion', value: (e) => getTruckLabel(e.camionId) },
        { header: 'Chauffeur / bénéficiaire salaire', value: (e) => formatSalaireBeneficiaire(e, getDriverLabel, thirdParties) },
        { header: 'Fournisseur', value: (e) => e.fournisseurId ? (thirdParties.find(tp => tp.id === e.fournisseurId)?.nom || '-') : '-' },
        { header: 'Quantité', value: (e) => e.quantite !== undefined && e.quantite > 0 ? `${e.quantite} ${getUnite(e.categorie)}` : '-' },
        { header: 'Prix unitaire (FCFA)', value: (e) => e.prixUnitaire !== undefined && e.prixUnitaire > 0 ? e.prixUnitaire : '-' },
        { header: 'Prix total (FCFA)', value: (e) => e.montant },
      ],
      rows: sortedExpenses,
    });
    toast.success('Export Excel généré avec succès');
  };

  const handleExportPDF = () => {
    // Calculer les totaux par catégorie
    const totalMontant = filteredExpenses.reduce((sum, e) => sum + e.montant, 0);
    const categories = [...new Set(filteredExpenses.map(e => e.categorie))];
    const totalCarburant = filteredExpenses.filter(e => e.categorie === 'Carburant').reduce((sum, e) => sum + e.montant, 0);
    const totalMaintenance = filteredExpenses.filter(e => e.categorie === 'Maintenance').reduce((sum, e) => sum + e.montant, 0);
    const totalAutres = filteredExpenses.filter(e => e.categorie !== 'Carburant' && e.categorie !== 'Maintenance').reduce((sum, e) => sum + e.montant, 0);

    exportToPrintablePDF({
      title: 'Liste des Dépenses',
      fileName: `depenses_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: getFiltersDescription(),
      // Couleurs thématiques pour les dépenses (rouge)
      headerColor: '#dc2626',
      headerTextColor: '#ffffff',
      evenRowColor: '#fef2f2',
      oddRowColor: '#ffffff',
      accentColor: '#dc2626',
      totals: [
        { label: 'Nombre de dépenses', value: filteredExpenses.length, style: 'neutral', icon: EMOJI.liste },
        { label: 'Total Carburant', value: `-${totalCarburant.toLocaleString('fr-FR')} FCFA`, style: 'negative', icon: EMOJI.carburant },
        { label: 'Total Maintenance', value: `-${totalMaintenance.toLocaleString('fr-FR')} FCFA`, style: 'negative', icon: EMOJI.maintenance },
        { label: 'Autres dépenses', value: `-${totalAutres.toLocaleString('fr-FR')} FCFA`, style: 'negative', icon: EMOJI.autre },
        { label: 'TOTAL GÉNÉRAL', value: `-${totalMontant.toLocaleString('fr-FR')} FCFA`, style: 'negative', icon: EMOJI.depense },
      ],
      columns: [
        { header: 'Date', value: (e) => `${EMOJI.date} ${new Date(e.date).toLocaleDateString('fr-FR')}` },
        { header: 'Catégorie', value: (e) => {
          const icons: Record<string, string> = {
            'Carburant': EMOJI.carburant,
            'Maintenance': EMOJI.maintenance,
            'Péage': EMOJI.peage,
            'Assurance': EMOJI.assurance,
          };
          return `${icons[e.categorie] || EMOJI.liste} ${e.categorie}`;
        }},
        { header: 'Sous-catégorie', value: (e) => e.sousCategorie || '-' },
        { header: 'Description', value: (e) => e.description },
        { header: 'Camion', value: (e) => `${EMOJI.camion} ${getTruckLabel(e.camionId)}` },
        {
          header: 'Chauffeur / bénéficiaire salaire',
          value: (e) => {
            const s = formatSalaireBeneficiaire(e, getDriverLabel, thirdParties);
            return s === '—' ? '—' : `${EMOJI.personne} ${s}`;
          },
        },
        { header: 'Quantité', value: (e) => e.quantite !== undefined && e.quantite > 0 ? `${e.quantite} ${getUnite(e.categorie)}` : '-' },
        { 
          header: 'Prix unitaire', 
          value: (e) => e.prixUnitaire !== undefined && e.prixUnitaire > 0 ? `-${e.prixUnitaire.toLocaleString('fr-FR')} FCFA` : '-',
          cellStyle: (e) => e.prixUnitaire !== undefined && e.prixUnitaire > 0 ? 'negative' : 'neutral'
        },
        { 
          header: 'Prix total (FCFA)', 
          value: (e) => `-${e.montant.toLocaleString('fr-FR')}`,
          cellStyle: () => 'negative'
        },
      ],
      rows: sortedExpenses,
    });
  };

  return (
    <div className="space-y-6 p-1">
      {!canManageAccounting && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Consultation seule.</strong> La saisie et la modification des dépenses sont réservées au profil{' '}
            <span className="font-medium">Comptable</span> (ou <span className="font-medium">Administrateur</span>).
          </AlertDescription>
        </Alert>
      )}
      {/* En-tête professionnel */}
      <PageHeader
        title="Gestion des Dépenses"
        description={PAGE_DEPENSES_DESCRIPTION}
        icon={Receipt}
        gradient="from-red-500/20 via-orange-500/10 to-transparent"
        stats={[
          {
            label: 'Total',
            value: `${totalExpenses.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`,
            icon: <TrendingDown className="h-4 w-4" />,
            color: 'text-red-600 dark:text-red-400'
          },
          {
            label: 'Nb. Dépenses',
            value: filteredExpenses.length,
            icon: <Receipt className="h-4 w-4" />,
            color: 'text-blue-600 dark:text-blue-400'
          },
          {
            label: 'Catégorie Top',
            value: topCategory ? topCategory[0] : 'N/A',
            icon: <DollarSign className="h-4 w-4" />,
            color: 'text-orange-600 dark:text-orange-400'
          },
          {
            label: 'Montant Top',
            value: topCategory ? `${topCategory[1].toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA` : '0',
            icon: <DollarSign className="h-4 w-4" />,
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
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              {canManageAccounting && (
              <DialogTrigger asChild>
                <Button className="shadow-md hover:shadow-lg transition-all duration-300">
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter une dépense
                </Button>
              </DialogTrigger>
              )}
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingExpense ? 'Modifier' : 'Ajouter'} une dépense</DialogTitle>
              </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="camion">Camion (optionnel)</Label>
                  <Select
                    value={formData.camionId || 'none'}
                    onValueChange={(value) => {
                      if (value === 'none') {
                        setFormData({ ...formData, camionId: '', chauffeurId: '' });
                        return;
                      }
                      const truck = trucks.find(t => t.id === value);
                      const chauffeurAssigne = truck?.chauffeurId || '';
                      setFormData({
                        ...formData,
                        camionId: value,
                        chauffeurId: chauffeurAssigne,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Aucun camion" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun camion</SelectItem>
                      {trucks.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.immatriculation} - {t.modele}
                          {t.chauffeurId && ` (${getDriverLabel(t.chauffeurId)})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Dépense générale ou siège : laissez sans camion.</p>
                </div>
                <div>
                  <Label htmlFor="chauffeur">
                    {formData.categorie === 'Salaire'
                      ? 'Chauffeur (si le salaire est pour un conducteur)'
                      : 'Chauffeur (optionnel)'}
                  </Label>
                  <Select
                    value={formData.chauffeurId || 'none'}
                    onValueChange={(value) => {
                      const id = value === 'none' ? '' : value;
                      setFormData((prev) => ({
                        ...prev,
                        chauffeurId: id,
                        fournisseurId: id ? '' : prev.fournisseurId,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {drivers.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.prenom} {d.nom}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.camionId && trucks.find(t => t.id === formData.camionId)?.chauffeurId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Pré-rempli avec le chauffeur assigné au camion
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="tripId">Trajet (optionnel)</Label>
                <Select value={formData.tripId || 'none'} onValueChange={(value) => setFormData({ ...formData, tripId: value === 'none' ? '' : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Lier à un trajet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun trajet</SelectItem>
                    {trips.map(trip => (
                      <SelectItem key={trip.id} value={trip.id}>
                        {trip.origine} → {trip.destination} {trip.client && `(${trip.client})`} - {new Date(trip.dateDepart).toLocaleDateString('fr-FR')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Lier cette dépense à un trajet spécifique</p>
              </div>
              <div>
                <Label htmlFor="categorie">Catégorie</Label>
                <Select
                  value={formData.categorie}
                  onValueChange={(value) => {
                    if (value === 'Salaire') {
                      setFormData({
                        ...formData,
                        categorie: value,
                        sousCategorie: '',
                        camionId: '',
                        tripId: '',
                        fournisseurId: '',
                        quantite: undefined,
                        prixUnitaire: undefined,
                      });
                      return;
                    }
                    setFormData((prev) => {
                      const next = { ...prev, categorie: value, sousCategorie: '' };
                      const fp = prev.fournisseurId
                        ? thirdParties.find((x) => x.id === prev.fournisseurId)
                        : undefined;
                      if (fp?.type === 'employe') {
                        next.fournisseurId = '';
                      }
                      return next;
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.categorie === 'Salaire' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Mode salaire : dépense hors camion / trajet. Renseignez un chauffeur <strong>ou</strong> un employé
                    enregistré sous Tiers (type « Personnel siège »).
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="sousCategorie">Sous-catégorie (optionnel)</Label>
                <div className="flex gap-2">
                  <Select value={formData.sousCategorie || 'none'} onValueChange={(value) => setFormData({ ...formData, sousCategorie: value === 'none' ? '' : value })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Sélectionner ou ajouter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      {(subCategories[formData.categorie] || []).map(sub => (
                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Input
                      placeholder="Nouvelle sous-catégorie"
                      value={newSubCategory}
                      onChange={(e) => setNewSubCategory(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubCategory())}
                      className="w-[180px]"
                    />
                    <Button type="button" onClick={handleAddSubCategory} size="sm" variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                {formData.categorie === 'Salaire' ? (
                  <>
                    <Label htmlFor="employe-siege">Employé / personnel siège</Label>
                    <ThirdPartyPicker
                      id="employe-siege"
                      className="mt-1"
                      options={employesSiege}
                      value={formData.fournisseurId}
                      onValueChange={(id) =>
                        setFormData((prev) => ({
                          ...prev,
                          fournisseurId: id,
                          chauffeurId: id ? '' : prev.chauffeurId,
                        }))
                      }
                      placeholder="Rechercher un employé siège…"
                      topChoices={[
                        {
                          id: '',
                          label: 'Aucun (ex. uniquement chauffeur)',
                          keywords: 'aucun chauffeur seul',
                        },
                      ]}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Fiches créées dans{' '}
                      <Link to="/tiers" className="text-primary font-medium underline-offset-2 hover:underline">
                        Tiers
                      </Link>{' '}
                      — type « Personnel siège ». Au moins un : chauffeur <em>ou</em> employé.
                    </p>
                  </>
                ) : (
                  <>
                <Label htmlFor="fournisseur-tier-picker">Fournisseur (optionnel)</Label>
                <ThirdPartyPicker
                  id="fournisseur-tier-picker"
                  className="mt-1"
                  options={fournisseursFiches}
                  value={formData.fournisseurId}
                  onValueChange={(id) =>
                    setFormData((prev) => ({
                      ...prev,
                      fournisseurId: id,
                      articleId: '',
                      prixUnitaire: undefined,
                    }))
                  }
                  placeholder="Rechercher un fournisseur…"
                  topChoices={[{ id: '', label: 'Aucun fournisseur', keywords: 'aucun sans' }]}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Vous pouvez ajouter des fournisseurs dans la section "Tiers"
                </p>
                {formData.fournisseurId && articlesForFournisseur.length > 0 && (
                  <div className="mt-3">
                    <Label htmlFor="expense-article">Article (tarif forfaitaire)</Label>
                    <Select
                      value={formData.articleId || '__none__'}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          setFormData((prev) => ({ ...prev, articleId: '', prixUnitaire: undefined }));
                          return;
                        }
                        applyArticleTarif(v, formData.fournisseurId);
                      }}
                    >
                      <SelectTrigger id="expense-article" className="mt-1">
                        <SelectValue placeholder="Choisir un article du catalogue…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Saisie manuelle —</SelectItem>
                        {articlesForFournisseur.map((a) => {
                          const pu = getArticleSupplierUnitPrice(a, formData.fournisseurId)!;
                          return (
                            <SelectItem key={a.id} value={a.id}>
                              {a.libelle} — {pu.toLocaleString('fr-FR')} FCFA / {a.unite}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tarifs définis dans{' '}
                      <Link to="/articles" className="text-primary underline-offset-2 hover:underline">
                        Articles
                      </Link>
                      . Le prix unitaire se remplit automatiquement.
                    </p>
                  </div>
                )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="quantite">Quantité ({getUniteLabel()})</Label>
                  <NumberInput
                    id="quantite"
                    min={0}
                    value={formData.quantite}
                    onChange={(value) => {
                      const newQuantite = value;
                      const calculatedMontant = calculateMontant(newQuantite, formData.prixUnitaire);
                      setFormData({ 
                        ...formData, 
                        quantite: newQuantite,
                        montant: calculatedMontant !== undefined ? calculatedMontant : formData.montant
                      });
                    }}
                    placeholder="Ex: 100"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Optionnel</p>
                </div>
                <div>
                  <Label htmlFor="prixUnitaire">Prix unitaire (FCFA)</Label>
                  <NumberInput
                    id="prixUnitaire"
                    min={0}
                    value={formData.prixUnitaire}
                    onChange={(value) => {
                      const newPrixUnitaire = value;
                      const calculatedMontant = calculateMontant(formData.quantite, newPrixUnitaire);
                      setFormData({ 
                        ...formData, 
                        prixUnitaire: newPrixUnitaire,
                        montant: calculatedMontant !== undefined ? calculatedMontant : formData.montant
                      });
                    }}
                    placeholder="Ex: 700"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Optionnel</p>
                </div>
                <div>
                  <Label htmlFor="montant">Prix total (FCFA)</Label>
                  <NumberInput
                    id="montant"
                    min={0}
                    value={formData.montant}
                    onChange={(value) => setFormData({ ...formData, montant: value })}
                    required
                    placeholder="Entrer le montant"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {formData.quantite && formData.prixUnitaire && formData.quantite > 0 && formData.prixUnitaire > 0
                      ? `Calculé: ${(formData.quantite * formData.prixUnitaire).toLocaleString('fr-FR')} FCFA`
                      : 'Saisie manuelle'}
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</> : (editingExpense ? 'Modifier' : 'Ajouter')}
              </Button>
            </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {/* Filtres - Design amélioré */}
      <div className="bg-gradient-to-br from-card to-muted/20 rounded-xl p-5 shadow-lg border border-border/50 backdrop-blur-sm">
        <div className="flex flex-col gap-4">
          {/* En-tête des filtres */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Filter className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Filtres</h3>
            </div>
            {(filterCamion !== 'all' || filterCategorie !== 'all' || filterSousCategorie !== 'all' || filterFournisseur !== 'all' || filterChauffeur !== 'all' || filterDateFrom || filterDateTo || filterMontantMin || filterMontantMax || searchTerm) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterCamion('all');
                  setFilterCategorie('all');
                  setFilterSousCategorie('all');
                  setFilterFournisseur('all');
                  setFilterChauffeur('all');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                  setFilterMontantMin('');
                  setFilterMontantMax('');
                  setSearchTerm('');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Réinitialiser
              </Button>
            )}
          </div>

          {/* Recherche générale */}
          <div>
            <Label htmlFor="search-expenses" className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Search className="h-4 w-4" />
              Recherche générale
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search-expenses"
                placeholder="Rechercher par description, catégorie, camion, chauffeur, fournisseur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filtres actifs */}
          {(filterCamion !== 'all' || filterCategorie !== 'all' || filterSousCategorie !== 'all' || filterFournisseur !== 'all' || filterChauffeur !== 'all' || filterDateFrom || filterDateTo || filterMontantMin || filterMontantMax) && (
            <div className="flex flex-wrap gap-2 pb-2">
              {filterCamion !== 'all' && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  <Truck className="h-3 w-3 mr-1.5" />
                  {filterCamion === 'none'
                    ? 'Sans camion'
                    : trucks.find(t => t.id === filterCamion)?.immatriculation || 'Camion'}
                  <button
                    onClick={() => setFilterCamion('all')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre camion"
                    title="Retirer le filtre camion"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterCategorie !== 'all' && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  <Tag className="h-3 w-3 mr-1.5" />
                  {filterCategorie}
                  <button
                    onClick={() => setFilterCategorie('all')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre catégorie"
                    title="Retirer le filtre catégorie"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterSousCategorie !== 'all' && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  <Tag className="h-3 w-3 mr-1.5" />
                  {filterSousCategorie === 'none' ? 'Sans sous-catégorie' : filterSousCategorie}
                  <button
                    onClick={() => setFilterSousCategorie('all')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre sous-catégorie"
                    title="Retirer le filtre sous-catégorie"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterFournisseur !== 'all' && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  <User className="h-3 w-3 mr-1.5" />
                  {filterFournisseur === 'none' ? 'Sans fournisseur' : (thirdParties.find(tp => tp.id === filterFournisseur)?.nom || 'Fournisseur')}
                  <button
                    onClick={() => setFilterFournisseur('all')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre fournisseur"
                    title="Retirer le filtre fournisseur"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterChauffeur !== 'all' && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  <User className="h-3 w-3 mr-1.5" />
                  {filterChauffeur === 'none' ? 'Sans chauffeur' : getDriverLabel(filterChauffeur)}
                  <button
                    onClick={() => setFilterChauffeur('all')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre chauffeur"
                    title="Retirer le filtre chauffeur"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterDateFrom && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  Du: {new Date(filterDateFrom).toLocaleDateString('fr-FR')}
                  <button
                    onClick={() => setFilterDateFrom('')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre date de début"
                    title="Retirer le filtre date de début"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterDateTo && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  Au: {new Date(filterDateTo).toLocaleDateString('fr-FR')}
                  <button
                    onClick={() => setFilterDateTo('')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre date de fin"
                    title="Retirer le filtre date de fin"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterMontantMin && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  Min: {parseFloat(filterMontantMin).toLocaleString('fr-FR')} FCFA
                  <button
                    onClick={() => setFilterMontantMin('')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre montant minimum"
                    title="Retirer le filtre montant minimum"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filterMontantMax && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 px-3 py-1.5">
                  Max: {parseFloat(filterMontantMax).toLocaleString('fr-FR')} FCFA
                  <button
                    onClick={() => setFilterMontantMax('')}
                    className="ml-2 hover:bg-primary/20 rounded-full p-0.5"
                    aria-label="Retirer le filtre montant maximum"
                    title="Retirer le filtre montant maximum"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}

          {/* Sélecteurs de filtres */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ListSortSelect
              id="sort-expenses"
              value={listSort}
              onChange={setListSort}
              options={[...EXPENSE_SORT_OPTIONS]}
            />
            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Filtrer par camion
              </Label>
              <Select value={filterCamion} onValueChange={setFilterCamion}>
                <SelectTrigger className="w-full h-11 bg-background hover:bg-muted/50 transition-colors border-border/50 focus:border-primary/50 shadow-sm">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sélectionner un camion" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-medium">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Tous les camions
                    </div>
                  </SelectItem>
                  <SelectItem value="none" className="font-medium">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      Sans camion
                    </div>
                  </SelectItem>
                  {trucks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <Truck className="h-3 w-3 text-muted-foreground" />
                        {t.immatriculation} - {t.modele}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Filtrer par catégorie
              </Label>
              <Select value={filterCategorie} onValueChange={(value) => {
                setFilterCategorie(value);
                setFilterSousCategorie('all'); // Réinitialiser la sous-catégorie quand on change de catégorie
              }}>
                <SelectTrigger className="w-full h-11 bg-background hover:bg-muted/50 transition-colors border-border/50 focus:border-primary/50 shadow-sm">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sélectionner une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-medium">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Toutes catégories
                    </div>
                  </SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        {cat}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filterCategorie !== 'all' && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Sous-catégorie
                </Label>
                <Select value={filterSousCategorie} onValueChange={setFilterSousCategorie}>
                  <SelectTrigger className="w-full h-11 bg-background hover:bg-muted/50 transition-colors border-border/50 focus:border-primary/50 shadow-sm">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Sélectionner une sous-catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les sous-catégories</SelectItem>
                    <SelectItem value="none">Sans sous-catégorie</SelectItem>
                    {(subCategories[filterCategorie] || []).map(sub => (
                      <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />
                Fournisseur
              </Label>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <ThirdPartyPicker
                  className="min-w-0 flex-1 min-h-11 bg-background hover:bg-muted/50"
                  options={fournisseursFiches}
                  value={filterFournisseur}
                  onValueChange={setFilterFournisseur}
                  placeholder="Filtrer par fournisseur…"
                  searchPlaceholder="Nom fournisseur, téléphone…"
                  topChoices={[
                    { id: 'all', label: 'Tous les fournisseurs', keywords: 'tous effacer' },
                    { id: 'none', label: 'Sans fournisseur', keywords: 'sans aucun' },
                  ]}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />
                Chauffeur
              </Label>
              <Select value={filterChauffeur} onValueChange={setFilterChauffeur}>
                <SelectTrigger className="w-full h-11 bg-background hover:bg-muted/50 transition-colors border-border/50 focus:border-primary/50 shadow-sm">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sélectionner un chauffeur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les chauffeurs</SelectItem>
                  <SelectItem value="none">Sans chauffeur</SelectItem>
                  {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.prenom} {d.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2">Date de début</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-11"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2">Date de fin</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-11"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2">Montant minimum (FCFA)</Label>
              <NumberInput
                value={filterMontantMin ? parseFloat(filterMontantMin) : undefined}
                onChange={(value) => setFilterMontantMin(value ? value.toString() : '')}
                min={0}
                placeholder="Min"
                className="h-11"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-muted-foreground mb-2">Montant maximum (FCFA)</Label>
              <NumberInput
                value={filterMontantMax ? parseFloat(filterMontantMax) : undefined}
                onChange={(value) => setFilterMontantMax(value ? value.toString() : '')}
                min={0}
                placeholder="Max"
                className="h-11"
              />
            </div>
          </div>
        </div>
      </div>

      <Card className="shadow-md">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20">
          <CardTitle className="flex items-center gap-2">
            {EMOJI.argent} Liste des Dépenses - Total: <span className="text-red-600 dark:text-red-400 font-bold">{totalExpenses.toLocaleString('fr-FR')} FCFA</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead>Sous-catégorie</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Camion</TableHead>
                <TableHead>Chauffeur</TableHead>
                <TableHead>Trajet</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead className="text-right">Prix unitaire</TableHead>
                <TableHead className="text-right">Prix total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedExpenses.map((expense) => {
                const hasInvoice = invoices.some(inv => inv.expenseId === expense.id);
                const supplier = expense.fournisseurId ? thirdParties.find(tp => tp.id === expense.fournisseurId) : null;
                
                return (
                <TableRow key={expense.id} className="hover:bg-muted/50 transition-colors duration-200">
                  <TableCell className="font-semibold">{expense.categorie}</TableCell>
                    <TableCell>{expense.sousCategorie || '-'}</TableCell>
                    <TableCell>{supplier ? supplier.nom : '-'}</TableCell>
                  <TableCell>{getTruckLabel(expense.camionId)}</TableCell>
                  <TableCell>{formatSalaireBeneficiaire(expense, getDriverLabel, thirdParties)}</TableCell>
                  <TableCell>
                    {expense.tripId ? (() => {
                      const trip = trips.find(t => t.id === expense.tripId);
                      return trip ? (
                        <div className="text-xs">
                          <div className="font-medium">{trip.origine} → {trip.destination}</div>
                          {trip.client && <div className="text-muted-foreground">{trip.client}</div>}
                        </div>
                      ) : '-';
                    })() : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell>{expense.description}</TableCell>
                  <TableCell>{new Date(expense.date).toLocaleDateString('fr-FR')}</TableCell>
                  <TableCell className="text-right">
                    {expense.quantite !== undefined && expense.quantite > 0
                      ? `${expense.quantite.toLocaleString('fr-FR')} ${getUnite(expense.categorie)}`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {expense.prixUnitaire !== undefined && expense.prixUnitaire > 0
                      ? `${expense.prixUnitaire.toLocaleString('fr-FR')} FCFA`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-bold text-destructive">{expense.montant.toLocaleString('fr-FR')} FCFA</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                        {canManageAccounting && !hasInvoice && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleCreateInvoice(expense)} 
                            className="hover:shadow-md transition-all duration-200"
                            title="Créer une facture"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                      {canManageAccounting && (
                      <Button size="sm" variant="outline" onClick={() => handleEdit(expense)} className="hover:shadow-md transition-all duration-200">
                        <Edit className="h-4 w-4" />
                      </Button>
                      )}
                      {canManageAccounting && (
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(expense.id)} className="hover:shadow-md transition-all duration-200">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog de création de facture */}
      <Dialog open={isInvoiceDialogOpen} onOpenChange={(open) => {
        setIsInvoiceDialogOpen(open);
        if (!open) resetInvoiceForm();
      }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créer une facture pour la dépense</DialogTitle>
          </DialogHeader>
          {selectedExpenseForInvoice && (
            <form onSubmit={handleSubmitInvoice} className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Dépense:</span>
                  <span className="text-sm">{selectedExpenseForInvoice.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Catégorie:</span>
                  <span className="text-sm">{selectedExpenseForInvoice.categorie} {selectedExpenseForInvoice.sousCategorie && `- ${selectedExpenseForInvoice.sousCategorie}`}</span>
                </div>
                {selectedExpenseForInvoice.fournisseurId && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Fournisseur:</span>
                    <span className="text-sm">
                      {thirdParties.find(tp => tp.id === selectedExpenseForInvoice.fournisseurId)?.nom || '-'}
                    </span>
                  </div>
                )}
                {selectedExpenseForInvoice.quantite !== undefined && selectedExpenseForInvoice.quantite > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Quantité:</span>
                    <span className="text-sm">{selectedExpenseForInvoice.quantite.toLocaleString('fr-FR')} {getUnite(selectedExpenseForInvoice.categorie)}</span>
                  </div>
                )}
                {selectedExpenseForInvoice.prixUnitaire !== undefined && selectedExpenseForInvoice.prixUnitaire > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Prix unitaire:</span>
                    <span className="text-sm">{selectedExpenseForInvoice.prixUnitaire.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Montant HT:</span>
                  <span className="text-sm font-bold">{selectedExpenseForInvoice.montant.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tva">TVA (%)</Label>
                  <NumberInput
                    id="tva"
                    min={0}
                    max={100}
                    value={invoiceFormData.tva}
                    onChange={(value) => setInvoiceFormData({ ...invoiceFormData, tva: value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label htmlFor="tps">TPS (%)</Label>
                  <NumberInput
                    id="tps"
                    min={0}
                    max={100}
                    value={invoiceFormData.tps}
                    onChange={(value) => setInvoiceFormData({ ...invoiceFormData, tps: value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes (optionnel)</Label>
                <Input
                  id="notes"
                  value={invoiceFormData.notes}
                  onChange={(e) => setInvoiceFormData({ ...invoiceFormData, notes: e.target.value })}
                  placeholder="Notes supplémentaires"
                />
              </div>

              <div className="bg-primary/10 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Montant HT:</span>
                  <span>{selectedExpenseForInvoice.montant.toLocaleString('fr-FR')} FCFA</span>
                </div>
                {invoiceFormData.tva > 0 && (
                  <div className="flex justify-between items-center mb-2 text-sm">
                    <span>TVA ({invoiceFormData.tva}%):</span>
                    <span>{(selectedExpenseForInvoice.montant * (invoiceFormData.tva / 100)).toLocaleString('fr-FR')} FCFA</span>
                  </div>
                )}
                {invoiceFormData.tps > 0 && (
                  <div className="flex justify-between items-center mb-2 text-sm">
                    <span>TPS ({invoiceFormData.tps}%):</span>
                    <span>{(selectedExpenseForInvoice.montant * (invoiceFormData.tps / 100)).toLocaleString('fr-FR')} FCFA</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t font-bold text-lg">
                  <span>Montant TTC:</span>
                  <span className="text-primary">
                    {(selectedExpenseForInvoice.montant + 
                      (selectedExpenseForInvoice.montant * (invoiceFormData.tva / 100)) + 
                      (selectedExpenseForInvoice.montant * (invoiceFormData.tps / 100))
                    ).toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsInvoiceDialogOpen(false)} className="flex-1">
                  Annuler
                </Button>
                <Button type="submit" className="flex-1" disabled={isInvoiceSubmitting}>
                  {isInvoiceSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : 'Créer la facture'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
