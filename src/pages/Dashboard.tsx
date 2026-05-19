import { useRef, useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, ClipboardList, DollarSign, TrendingUp, TrendingDown, FileText, Users, Package, AlertCircle, LayoutDashboard, Building2, Wallet, RefreshCw, HardDrive, Upload, Receipt, Layers, UserCircle2, UserCog } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import {
  calculatePaidAmountForParcelExpedition,
  calculatePaidAmountForTrip,
  getTotalCreancesClients,
} from '@/lib/sync-utils';
import { cn } from '@/lib/utils';
import { EMOJI } from '@/lib/emoji-palette';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/lib/api';
import { toast } from 'sonner';
import { ExportButtons } from '@/components/ExportButtons';
import { exportDocumentToExcel, exportDocumentToPDF } from '@/lib/export-utils';
import { formatClientOrderStatusFr } from '@/lib/client-operations';
import { getCaisseSoldeActuel, getTotalBanqueDisponible } from '@/lib/bank-local';
import {
  buildDashboardMonths,
  formatMonthLabelFr,
  isSameCalendarMonth,
} from '@/lib/calendar-month';

/** Axe Y : montants lisibles (k / M) */
function formatAxisFcfa(v: number): string {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n === 0) return '0';
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10} M`.replace('.', ',');
  }
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
}

function MonthlyTrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/80 bg-popover/95 px-4 py-3 shadow-lg backdrop-blur-sm min-w-[200px]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
        {label}
      </p>
      <ul className="space-y-2">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-6 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full ring-2 ring-background"
                style={{ backgroundColor: p.color ?? 'hsl(var(--primary))' }}
              />
              {p.name}
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {(p.value ?? 0).toLocaleString('fr-FR')} <span className="text-muted-foreground font-normal">FCFA</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { trucks, trips, clientOrders, parcelExpeditions, expenses, invoices, drivers, refreshTrucks, refreshDrivers, refreshTrips, refreshParcelExpeditions, refreshExpenses, refreshInvoices, refreshThirdParties } = useApp();
  const { user } = useAuth();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const response = await adminApi.backup();
      if (!response.ok) throw new Error('Erreur lors de la génération du backup');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = `truck-track-backup-${new Date().toISOString().split('T')[0]}.json`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Backup téléchargé : ${filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors du backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      toast.error('Fichier invalide : sélectionnez un fichier .json');
      e.target.value = '';
      return;
    }
    if (!confirm(
      '⚠️ ATTENTION : La restauration va ÉCRASER toutes les données actuelles.\n\nContinuer la restauration ?'
    )) {
      e.target.value = '';
      return;
    }
    setIsRestoring(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.data || !parsed.version) throw new Error('Fichier de backup invalide ou corrompu');
      const result = await adminApi.restore(parsed.data);
      await Promise.all([refreshTrucks(), refreshDrivers(), refreshTrips(), refreshParcelExpeditions(), refreshExpenses(), refreshInvoices(), refreshThirdParties()]);
      toast.success(`Restauration réussie — ${Object.values(result.counts).reduce((a, b) => a + b, 0)} enregistrements restaurés`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la restauration');
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  // Définition des raccourcis vers les écrans
  const shortcuts = [
    { name: 'Camions', href: '/camions', icon: Truck, color: 'from-purple-500 to-pink-500', bgColor: 'bg-purple-50 dark:bg-purple-950/30', borderColor: 'border-purple-200 dark:border-purple-800' },
    { name: 'Clients', href: '/clients', icon: UserCircle2, color: 'from-emerald-500 to-teal-500', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', borderColor: 'border-emerald-200 dark:border-emerald-800' },
    { name: 'Caisse', href: '/caisse', icon: Wallet, color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-50 dark:bg-green-950/30', borderColor: 'border-green-200 dark:border-green-800' },
    { name: 'Factures', href: '/factures', icon: FileText, color: 'from-indigo-500 to-blue-500', bgColor: 'bg-indigo-50 dark:bg-indigo-950/30', borderColor: 'border-indigo-200 dark:border-indigo-800' },
    { name: 'Chauffeurs', href: '/chauffeurs', icon: Users, color: 'from-cyan-500 to-teal-500', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30', borderColor: 'border-cyan-200 dark:border-cyan-800' },
    { name: 'Tiers', href: '/tiers', icon: Building2, color: 'from-violet-500 to-purple-500', bgColor: 'bg-violet-50 dark:bg-violet-950/30', borderColor: 'border-violet-200 dark:border-violet-800' },
  ];

  // Chiffre d'affaires (montants payés sur factures trajets + expéditions)
  const totalRecettes = invoices
    .filter((inv) => inv.trajetId || inv.parcelExpeditionId)
    .reduce((sum, inv) => sum + (inv.montantPaye || 0), 0);
  const totalDepenses = expenses.reduce((sum, exp) => sum + exp.montant, 0);
  const totalProfit = totalRecettes - totalDepenses;
  const activeTrucks = trucks.filter(t => t.statut === 'actif').length;

  /** Recalculé à chaque rendu (localStorage) — aligné Caisse / Banque. */
  const soldeCaisseEspeces = getCaisseSoldeActuel();
  const soldeBanqueDisponible = getTotalBanqueDisponible();
  const tresorerieTotale = soldeCaisseEspeces + soldeBanqueDisponible;
  /** Factures : reste à encaisser (pas encore passé en caisse ni en banque dans l'app). */
  const creancesClients = getTotalCreancesClients(invoices);
  const positionEntreprise = tresorerieTotale + creancesClients;
  
  // Statistiques avancées
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter(inv => inv.statut === 'payee').length;
  const pendingInvoices = invoices.filter(inv => inv.statut === 'en_attente').length;
  const pendingAmount = invoices
    .filter(inv => inv.statut === 'en_attente')
    .reduce((sum, inv) => sum + inv.montantTTC, 0);
  
  const deliveredOrders = clientOrders.filter((o) => o.statut === 'livree').length;
  const activeOrders = clientOrders.filter((o) =>
    ['confirmee', 'en_preparation', 'partiellement_livree'].includes(o.statut),
  ).length;
  const draftOrders = clientOrders.filter((o) => o.statut === 'brouillon').length;
  const cancelledOrders = clientOrders.filter((o) => o.statut === 'annulee').length;

  const recentOrdersSorted = useMemo(
    () =>
      [...clientOrders].sort(
        (a, b) => new Date(b.dateCommande).getTime() - new Date(a.dateCommande).getTime(),
      ),
    [clientOrders],
  );

  // Top camions par encaissement (basé sur les montants payés)
  const truckRevenue = trucks.map(truck => {
    const truckTrips = trips.filter(t => t.tracteurId === truck.id || t.remorqueuseId === truck.id);
    const truckExpeditions = parcelExpeditions.filter(
      (ex) => ex.tracteurId === truck.id || ex.remorqueuseId === truck.id,
    );
    // Encaissements à partir des montants payés
    const revenueTrips = truckTrips.reduce(
      (sum, trip) => sum + calculatePaidAmountForTrip(trip.id, invoices),
      0,
    );
    const revenueExpeditions = truckExpeditions.reduce((sum, ex) => {
      return sum + calculatePaidAmountForParcelExpedition(ex.id, invoices);
    }, 0);
    const revenue = revenueTrips + revenueExpeditions;
    const tripsCount = truckTrips.length + truckExpeditions.length;
    return { 
      name: truck.immatriculation, 
      revenue,
      tripsCount,
      model: truck.modele 
    };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Dépenses par catégorie
  const expensesByCategory = expenses.reduce((acc, exp) => {
    acc[exp.categorie] = (acc[exp.categorie] || 0) + exp.montant;
    return acc;
  }, {} as Record<string, number>);

  const expensesData = Object.entries(expensesByCategory).map(([name, value]) => ({ 
    name, 
    value,
    percentage: ((value / totalDepenses) * 100).toFixed(1)
  }));

  // Évolution mensuelle : dates calendaires (sans décalage fuseau) + mois présents dans les données
  const monthlyData = useMemo(() => {
    const chartMonths = buildDashboardMonths(
      [
        ...expenses.map((e) => e.date),
        ...trips.map((t) => t.dateDepart),
        ...parcelExpeditions.map((ex) => ex.dateDepart),
        ...invoices.map((inv) => inv.datePaiement ?? inv.dateCreation),
      ],
      { trailingMonths: 12, maxPoints: 18 },
    );

    return chartMonths.map((bucket) => {
      const monthTrips = trips.filter((trip) =>
        isSameCalendarMonth(trip.dateDepart, bucket),
      );
      const monthExpeditions = parcelExpeditions.filter((ex) =>
        isSameCalendarMonth(ex.dateDepart, bucket),
      );
      const monthExpenses = expenses.filter((exp) => isSameCalendarMonth(exp.date, bucket));

      const monthRecettesTrips = monthTrips.reduce(
        (sum, trip) => sum + calculatePaidAmountForTrip(trip.id, invoices),
        0,
      );
      const monthRecettesExpeditions = monthExpeditions.reduce(
        (sum, ex) => sum + calculatePaidAmountForParcelExpedition(ex.id, invoices),
        0,
      );

      return {
        month: formatMonthLabelFr(bucket),
        recettes: monthRecettesTrips + monthRecettesExpeditions,
        depenses: monthExpenses.reduce((sum, exp) => sum + exp.montant, 0),
      };
    });
  }, [expenses, trips, parcelExpeditions, invoices]);

  const COLORS = [
    'hsl(var(--chart-1))', 
    'hsl(var(--chart-2))', 
    'hsl(var(--chart-3))', 
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))'
  ];

  const handleExportExcel = () => {
    exportDocumentToExcel({
      title: 'Synthèse tableau de bord',
      fileName: `dashboard_${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName: 'Dashboard',
      summary: {
        title: 'Indicateurs clés',
        columns: ['Indicateur', 'Valeur'],
        rows: [
          ['Encaissement (trajets + colis)', `${Math.round(totalRecettes).toLocaleString('fr-FR')} FCFA`],
          ['Dépenses', `${Math.round(totalDepenses).toLocaleString('fr-FR')} FCFA`],
          ['Bénéfice', `${Math.round(totalProfit).toLocaleString('fr-FR')} FCFA`],
          ['Flotte active', `${activeTrucks} / ${trucks.length}`],
          ['Caisse espèces', `${Math.round(soldeCaisseEspeces).toLocaleString('fr-FR')} FCFA`],
          ['Banque disponible', `${Math.round(soldeBanqueDisponible).toLocaleString('fr-FR')} FCFA`],
          ['Trésorerie totale', `${Math.round(tresorerieTotale).toLocaleString('fr-FR')} FCFA`],
          ['Créances clients', `${Math.round(creancesClients).toLocaleString('fr-FR')} FCFA`],
          ['Position entreprise', `${Math.round(positionEntreprise).toLocaleString('fr-FR')} FCFA`],
          ['Factures en attente', `${pendingInvoices} (${Math.round(pendingAmount).toLocaleString('fr-FR')} FCFA)`],
          ['Commandes actives', String(activeOrders)],
          ['Commandes livrées', String(deliveredOrders)],
        ],
      },
      sections: [
        {
          title: 'Évolution mensuelle',
          columns: ['Mois', 'Recettes (FCFA)', 'Dépenses (FCFA)'],
          rows: monthlyData.map((m) => [m.month, Math.round(m.recettes), Math.round(m.depenses)]),
        },
        {
          title: 'Dépenses par catégorie',
          columns: ['Catégorie', 'Montant (FCFA)', '%'],
          rows: expensesData.map((e) => [e.name, Math.round(e.value), `${e.percentage}%`]),
        },
        {
          title: 'Top camions (encaissement)',
          columns: ['Immatriculation', 'Modèle', 'Missions', 'Encaissement (FCFA)'],
          rows: truckRevenue.map((t) => [t.name, t.model, t.tripsCount, Math.round(t.revenue)]),
        },
        {
          title: 'Commandes récentes',
          columns: ['Date', 'Désignation', 'Statut', 'Montant (FCFA)'],
          rows: recentOrdersSorted.slice(0, 30).map((o) => [
            o.dateCommande,
            o.designation,
            formatClientOrderStatusFr(o.statut),
            o.montant != null ? Math.round(o.montant) : '—',
          ]),
        },
      ],
    });
    toast.success('Export Excel généré');
  };

  const handleExportPDF = () => {
    exportDocumentToPDF({
      title: 'Synthèse tableau de bord',
      fileName: `dashboard_${new Date().toISOString().split('T')[0]}.pdf`,
      headerColor: '#7c3aed',
      accentColor: '#7c3aed',
      summary: {
        title: 'Indicateurs clés',
        columns: ['Indicateur', 'Valeur'],
        rows: [
          ['Encaissement', `${Math.round(totalRecettes).toLocaleString('fr-FR')} FCFA`],
          ['Dépenses', `${Math.round(totalDepenses).toLocaleString('fr-FR')} FCFA`],
          ['Bénéfice', `${Math.round(totalProfit).toLocaleString('fr-FR')} FCFA`],
          ['Créances clients', `${Math.round(creancesClients).toLocaleString('fr-FR')} FCFA`],
        ],
      },
      sections: [
        {
          title: 'Évolution mensuelle',
          columns: ['Mois', 'Recettes', 'Dépenses'],
          rows: monthlyData.map((m) => [
            m.month,
            Math.round(m.recettes).toLocaleString('fr-FR'),
            Math.round(m.depenses).toLocaleString('fr-FR'),
          ]),
        },
        {
          title: 'Top camions',
          columns: ['Camion', 'Encaissement (FCFA)'],
          rows: truckRevenue.map((t) => [t.name, Math.round(t.revenue).toLocaleString('fr-FR')]),
        },
      ],
      totals: [
        { label: 'Factures', value: totalInvoices, style: 'neutral' },
        { label: 'Commandes actives', value: activeOrders, style: 'neutral' },
      ],
    });
    toast.success('Export PDF — enregistrez via la fenêtre d’impression');
  };

  return (
    <div className="space-y-6 p-1">
      {/* En-tête professionnel */}
      <PageHeader
        title="Tableau de Bord"
        icon={LayoutDashboard}
        gradient="from-violet-500/20 via-fuchsia-500/10 to-transparent"
        stats={[
          {
            label: 'Encaissement',
            value: `${totalRecettes.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`,
            icon: <TrendingUp className="h-4 w-4" />,
            color: 'text-green-600 dark:text-green-400'
          },
          {
            label: 'Dépenses',
            value: `${totalDepenses.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`,
            icon: <TrendingDown className="h-4 w-4" />,
            color: 'text-red-600 dark:text-red-400',
          },
          {
            label: 'Bénéfice',
            value: `${totalProfit.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`,
            icon: <DollarSign className="h-4 w-4" />,
            color: 'text-purple-600 dark:text-purple-400',
          },
          {
            label: 'Flotte Active',
            value: `${activeTrucks}/${trucks.length}`,
            icon: <Truck className="h-4 w-4" />,
            color: 'text-blue-600 dark:text-blue-400'
          }
        ]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <ExportButtons onExcel={handleExportExcel} onPdf={handleExportPDF} size="sm" />
            <Badge variant="outline" className="text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2 hidden sm:flex">
              {EMOJI.date} {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Badge>
            <Badge variant="outline" className="text-xs px-2 py-1.5 flex sm:hidden">
              {EMOJI.date} {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </Badge>
            {user?.role === 'admin' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackup}
                  disabled={isBackingUp}
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
                >
                  {isBackingUp ? <RefreshCw className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                  {isBackingUp ? 'Export...' : 'Backup'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreFileRef.current?.click()}
                  disabled={isRestoring}
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
                >
                  {isRestoring ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isRestoring ? 'Restauration...' : 'Restaurer'}
                </Button>
                <input
                  ref={restoreFileRef}
                  type="file"
                  accept=".json"
                  aria-label="Sélectionner un fichier de backup JSON"
                  className="hidden"
                  onChange={handleRestoreFile}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/utilisateurs')}
                  className="gap-1.5 sm:gap-2 text-xs sm:text-sm"
                >
                  <UserCog className="h-4 w-4" />
                  Utilisateurs
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Liquidités (caisse + banque) vs hors trésorerie (créances factures) */}
      <Card className="overflow-hidden border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-background to-sky-500/5">
        <CardHeader className="pb-2 border-b border-border/60">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Trésorerie &amp; hors trésorerie
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            <strong className="text-foreground">Liquidités</strong> : argent déjà en caisse et sur les comptes bancaires.
            <span className="mx-1.5 text-border">|</span>
            <strong className="text-foreground">Hors caisse &amp; banque</strong> : créances clients (reste à encaisser sur les factures).
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
                <Wallet className="h-4 w-4 shrink-0" />
                Liquidités (caisse + banques)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-background/80 p-3 border border-border/60">
                  <p className="text-xs text-muted-foreground mb-1">Caisse</p>
                  <p className="font-bold tabular-nums">{soldeCaisseEspeces.toLocaleString('fr-FR')} FCFA</p>
                </div>
                <div className="rounded-lg bg-background/80 p-3 border border-border/60">
                  <p className="text-xs text-muted-foreground mb-1">Banque</p>
                  <p className="font-bold tabular-nums">{soldeBanqueDisponible.toLocaleString('fr-FR')} FCFA</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-emerald-500/20">
                <span className="text-sm font-medium">Sous-total liquidités</span>
                <span className="text-lg sm:text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {tresorerieTotale.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20 p-4 sm:p-5 flex flex-col">
              <div className="flex items-center gap-2 font-semibold text-sky-800 dark:text-sky-300">
                <Receipt className="h-4 w-4 shrink-0" />
                Hors caisse &amp; banque
              </div>
              <p className="text-xs text-muted-foreground mt-2 mb-4 flex-1">
                Créances clients : montants encore dus sur les factures (pas encore enregistrés comme encaissés).
              </p>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
                {creancesClients.toLocaleString('fr-FR')} FCFA
              </div>
            </div>

            <div className="rounded-2xl border-2 border-primary/25 bg-primary/5 dark:bg-primary/10 p-4 sm:p-5 flex flex-col">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Layers className="h-4 w-4 shrink-0" />
                Position globale
              </div>
              <p className="text-xs text-muted-foreground mt-2 mb-4 flex-1">
                Liquidités + créances : trésorerie disponible + montants à recevoir des clients.
              </p>
              <div className="text-2xl sm:text-3xl font-bold tabular-nums text-primary">
                {positionEntreprise.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Raccourcis vers les écrans */}
      <Card className="shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{EMOJI.accesRapide} Accès Rapide</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Naviguez rapidement vers les différents modules</p>
            </div>
            <LayoutDashboard className="h-8 w-8 text-primary opacity-50" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon;
              return (
                <Button
                  key={shortcut.href}
                  variant="outline"
                  className={cn(
                    "h-auto flex flex-col items-center justify-center gap-2 sm:gap-3 p-3 sm:p-6 hover:shadow-lg transition-all duration-300 group",
                    shortcut.bgColor,
                    shortcut.borderColor,
                    "border-2 hover:scale-105"
                  )}
                  onClick={() => navigate(shortcut.href)}
                >
                  <div className={cn(
                    "p-3 rounded-xl bg-gradient-to-br transition-all duration-300 group-hover:scale-110",
                    shortcut.color
                  )}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <span className="font-semibold text-xs sm:text-sm text-center">{shortcut.name}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>


      {/* Courbe — évolution mensuelle (toujours visible) */}
      <Card className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
        <CardHeader className="border-b border-border/60 bg-gradient-to-br from-muted/40 via-background to-background px-6 pb-5 pt-6 dark:from-muted/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Performance
              </p>
              <CardTitle className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Chiffre d&apos;affaires vs dépenses
              </CardTitle>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Encaissements réels (trajets &amp; expéditions) et dépenses selon leur date comptable — jusqu’à 12 mois + tout mois où il y a de l’activité.
              </p>
            </div>
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary ring-1 ring-primary/15 dark:bg-primary/15"
              aria-hidden
            >
              <TrendingUp className="h-6 w-6" strokeWidth={2} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-6 pt-8 sm:px-6">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthlyData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid
                strokeDasharray="4 6"
                vertical={false}
                stroke="hsl(var(--border))"
                strokeOpacity={0.85}
              />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                width={56}
                tickFormatter={formatAxisFcfa}
                domain={[0, 'auto']}
              />
              <Tooltip content={<MonthlyTrendTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Line
                type="monotone"
                dataKey="recettes"
                name="Chiffre d'affaires"
                stroke="hsl(160 55% 38%)"
                strokeWidth={2.75}
                dot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: 'hsl(var(--background))',
                  fill: 'hsl(160 55% 38%)',
                }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
              <Line
                type="monotone"
                dataKey="depenses"
                name="Dépenses"
                stroke="hsl(262 52% 52%)"
                strokeWidth={2.75}
                dot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: 'hsl(var(--background))',
                  fill: 'hsl(262 52% 52%)',
                }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-t border-border/60 pt-5 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-10 rounded-full bg-[hsl(160_55%_38%)] shadow-sm" />
              <span className="font-medium text-foreground">Chiffre d&apos;affaires</span>
              <span className="text-muted-foreground">encaissements</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-10 rounded-full bg-[hsl(262_52%_52%)] shadow-sm" />
              <span className="font-medium text-foreground">Dépenses</span>
              <span className="text-muted-foreground">charges du mois</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats secondaires */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Factures</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Payées</span>
                <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                  {paidInvoices}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">En attente</span>
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400">
                  {pendingInvoices}
                </Badge>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Montant en attente</p>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{pendingAmount.toLocaleString('fr-FR')} FCFA</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Commandes</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Livrées</span>
                <Badge variant="default">{deliveredOrders}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">En cours</span>
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                  {activeOrders}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Brouillons</span>
                <Badge variant="outline">{draftOrders}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Annulées</span>
                <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {cancelledOrders}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Chauffeurs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold mb-2">{drivers.length}</div>
            <p className="text-sm text-muted-foreground">Chauffeurs actifs</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts - Design amélioré */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top 5 Camions */}
        {truckRevenue.length > 0 && truckRevenue.some(t => t.revenue > 0) ? (
        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="bg-gradient-to-br from-background to-muted/20 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{EMOJI.classement} Top 5 Camions — Encaissement</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Classement par performance</p>
              </div>
              <Package className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={truckRevenue} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" width={80} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  formatter={(value: number) => [
                    `${value.toLocaleString('fr-FR')} FCFA`,
                    'Encaissement'
                  ]}
                />
                <Bar dataKey="revenue" fill="url(#colorRevenue)" radius={[0, 8, 8, 0]} />
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        ) : null}

        {/* Dépenses par catégorie */}
        {expensesData.length > 0 && expensesData.some(e => e.value > 0) ? (
        <Card className="shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="bg-gradient-to-br from-background to-muted/20 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{EMOJI.argent} Répartition des Dépenses</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Par catégorie</p>
              </div>
              <DollarSign className="h-8 w-8 text-destructive opacity-50" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={expensesData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={100}
                  innerRadius={60}
                  fill="hsl(var(--primary))"
                  dataKey="value"
                  paddingAngle={2}
                >
                  {expensesData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  formatter={(value: number) => [
                    `${value.toLocaleString('fr-FR')} FCFA`,
                    'Montant'
                  ]}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        ) : null}
      </div>


      {/* Recent Activity - Amélioré */}
      <Card className="shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{EMOJI.liste} Dernières commandes</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">5 commandes les plus récentes (tous statuts)</p>
            </div>
            <ClipboardList className="h-8 w-8 text-accent opacity-50" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {recentOrdersSorted.slice(0, 5).map((order, index) => {
              const orderStatusColor = (() => {
                switch (order.statut) {
                  case 'livree': return 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400';
                  case 'confirmee':
                  case 'en_preparation':
                  case 'partiellement_livree':
                    return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
                  case 'brouillon': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400';
                  case 'annulee': return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300';
                  default: return 'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-400';
                }
              })();

              return (
                <div 
                  key={order.id} 
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-primary/30 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0 group-hover:scale-110 transition-transform">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        <p className="font-semibold text-foreground text-sm sm:text-base truncate">
                          {order.designation}
                          {order.destination ? ` — ${order.destination}` : ''}
                        </p>
                        <Badge className={`text-xs flex-shrink-0 ${orderStatusColor}`}>
                          {formatClientOrderStatusFr(order.statut)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        <span>{EMOJI.date} {new Date(order.dateCommande).toLocaleDateString('fr-FR')}</span>
                        {order.reference && <span className="hidden sm:inline">{EMOJI.liste} {order.reference}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base sm:text-xl font-bold text-primary group-hover:scale-110 transition-transform inline-block">
                      {(order.montant ?? 0).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-xs text-muted-foreground">FCFA</p>
                  </div>
                </div>
              );
            })}
            {clientOrders.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Aucune commande enregistrée</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

