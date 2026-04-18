import { useRef, useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Truck, Route, DollarSign, TrendingUp, TrendingDown, FileText, Users, Package, AlertCircle, LayoutDashboard, Building2, Landmark, CreditCard, Wallet, RefreshCw, HardDrive, Upload, Receipt, Layers, MapPin, Satellite } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, Area, AreaChart } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { calculatePaidAmountForTrip, getTotalCreancesClients } from '@/lib/sync-utils';
import { cn } from '@/lib/utils';
import { EMOJI } from '@/lib/emoji-palette';
import { useAuth } from '@/contexts/AuthContext';
import { adminApi } from '@/lib/api';
import { toast } from 'sonner';
import { getCaisseSoldeActuel, getTotalBanqueDisponible } from '@/lib/bank-local';

export default function Dashboard() {
  const navigate = useNavigate();
  const { trucks, trips, expenses, invoices, drivers, refreshTrucks, refreshDrivers, refreshTrips, refreshParcelExpeditions, refreshExpenses, refreshInvoices, refreshThirdParties } = useApp();
  const { user, users, changeUserPassword } = useAuth();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPwdDialogOpen, setIsPwdDialogOpen] = useState(false);
  const [targetLogin, setTargetLogin] = useState('admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLogin) {
      toast.error('Sélectionnez un utilisateur.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas.');
      return;
    }
    try {
      await changeUserPassword(targetLogin, newPassword);
      toast.success(`Mot de passe mis à jour pour ${targetLogin}.`);
      setNewPassword('');
      setConfirmPassword('');
      setIsPwdDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur mise à jour mot de passe');
    }
  };

  // Définition des raccourcis vers les écrans
  const shortcuts = [
    { name: 'Camions', href: '/camions', icon: Truck, color: 'from-purple-500 to-pink-500', bgColor: 'bg-purple-50 dark:bg-purple-950/30', borderColor: 'border-purple-200 dark:border-purple-800' },
    { name: 'Trajets', href: '/trajets', icon: Route, color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-50 dark:bg-green-950/30', borderColor: 'border-green-200 dark:border-green-800' },
    { name: 'Caisse', href: '/caisse', icon: Wallet, color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-50 dark:bg-green-950/30', borderColor: 'border-green-200 dark:border-green-800' },
    { name: 'Factures', href: '/factures', icon: FileText, color: 'from-indigo-500 to-blue-500', bgColor: 'bg-indigo-50 dark:bg-indigo-950/30', borderColor: 'border-indigo-200 dark:border-indigo-800' },
    { name: 'Chauffeurs', href: '/chauffeurs', icon: Users, color: 'from-cyan-500 to-teal-500', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30', borderColor: 'border-cyan-200 dark:border-cyan-800' },
    { name: 'Tiers', href: '/tiers', icon: Building2, color: 'from-violet-500 to-purple-500', bgColor: 'bg-violet-50 dark:bg-violet-950/30', borderColor: 'border-violet-200 dark:border-violet-800' },
    { name: 'Envoi colis', href: '/envoi-colis', icon: Package, color: 'from-sky-500 to-cyan-500', bgColor: 'bg-sky-50 dark:bg-sky-950/30', borderColor: 'border-sky-200 dark:border-sky-800' },
    { name: 'Banque', href: '/banque', icon: Landmark, color: 'from-amber-500 to-yellow-500', bgColor: 'bg-amber-50 dark:bg-amber-950/30', borderColor: 'border-amber-200 dark:border-amber-800' },
    { name: 'Suivi créances', href: '/credits', icon: CreditCard, color: 'from-emerald-500 to-teal-500', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', borderColor: 'border-emerald-200 dark:border-emerald-800' },
    { name: 'Suivi GPS', href: '/suivi', icon: MapPin, color: 'from-sky-500 to-blue-500', bgColor: 'bg-sky-50 dark:bg-sky-950/30', borderColor: 'border-sky-200 dark:border-sky-800' },
    { name: 'GPS', href: '/gps', icon: Satellite, color: 'from-blue-500 to-cyan-500', bgColor: 'bg-blue-50 dark:bg-blue-950/30', borderColor: 'border-blue-200 dark:border-blue-800' },
  ];

  // Chiffre d’affaires (montants payés sur factures trajets)
  const totalRecettes = invoices
    .filter(inv => inv.trajetId) // Seulement les factures liées à des trajets
    .reduce((sum, inv) => sum + (inv.montantPaye || 0), 0);
  const totalDepenses = expenses.reduce((sum, exp) => sum + exp.montant, 0);
  const totalProfit = totalRecettes - totalDepenses;
  const profitMargin = totalRecettes > 0 ? ((totalProfit / totalRecettes) * 100).toFixed(1) : 0;
  const activeTrucks = trucks.filter(t => t.statut === 'actif').length;

  /** Recalculé à chaque rendu (localStorage) — aligné Caisse / Banque. */
  const soldeCaisseEspeces = getCaisseSoldeActuel();
  const soldeBanqueDisponible = getTotalBanqueDisponible();
  const tresorerieTotale = soldeCaisseEspeces + soldeBanqueDisponible;
  /** Factures : reste à encaisser (pas encore passé en caisse ni en banque dans l’app). */
  const creancesClients = getTotalCreancesClients(invoices);
  const positionEntreprise = tresorerieTotale + creancesClients;
  
  // Statistiques avancées
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter(inv => inv.statut === 'payee').length;
  const pendingInvoices = invoices.filter(inv => inv.statut === 'en_attente').length;
  const pendingAmount = invoices
    .filter(inv => inv.statut === 'en_attente')
    .reduce((sum, inv) => sum + inv.montantTTC, 0);
  
  const completedTrips = trips.filter(t => t.statut === 'termine').length;
  const ongoingTrips = trips.filter(t => t.statut === 'en_cours').length;
  const plannedTrips = trips.filter(t => t.statut === 'planifie').length;
  const cancelledTrips = trips.filter(t => t.statut === 'annule').length;

  const recentTripsSorted = useMemo(
    () =>
      [...trips].sort(
        (a, b) => new Date(b.dateDepart).getTime() - new Date(a.dateDepart).getTime(),
      ),
    [trips],
  );

  // Top camions par encaissement (basé sur les montants payés)
  const truckRevenue = trucks.map(truck => {
    const truckTrips = trips.filter(t => t.tracteurId === truck.id || t.remorqueuseId === truck.id);
    // Encaissements à partir des montants payés
    const revenue = truckTrips.reduce((sum, trip) => {
      return sum + calculatePaidAmountForTrip(trip.id, invoices);
    }, 0);
    const tripsCount = truckTrips.length;
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

  // Évolution mensuelle basée sur les vraies données
  const monthlyData = (() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Calculer les données pour les 3 derniers mois
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const monthName = date.toLocaleDateString('fr-FR', { month: 'short' });
      
      // Chiffre d’affaires et dépenses pour ce mois
      const monthTrips = trips.filter(trip => {
        const tripDate = new Date(trip.dateDepart);
        return tripDate.getMonth() === date.getMonth() && 
               tripDate.getFullYear() === date.getFullYear();
      });
      
      const monthExpenses = expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate.getMonth() === date.getMonth() && 
               expDate.getFullYear() === date.getFullYear();
      });
      
      // Chiffre d’affaires du mois à partir des montants payés
      const monthRecettes = monthTrips.reduce((sum, trip) => {
        return sum + calculatePaidAmountForTrip(trip.id, invoices);
      }, 0);
      const monthDepenses = monthExpenses.reduce((sum, exp) => sum + exp.montant, 0);
      
      months.push({
        month: monthName,
        recettes: monthRecettes,
        depenses: monthDepenses
      });
    }
    
    return months;
  })();

  const COLORS = [
    'hsl(var(--chart-1))', 
    'hsl(var(--chart-2))', 
    'hsl(var(--chart-3))', 
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))'
  ];

  return (
    <div className="space-y-6 p-1">
      {/* En-tête professionnel */}
      <PageHeader
        title="Tableau de Bord"
        description="Encaissements et bénéfice : factures (montants payés sur trajets) et dépenses enregistrées — les dons saisis uniquement en Caisse n’y sont pas inclus."
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
            color: 'text-red-600 dark:text-red-400'
          },
          {
            label: 'Bénéfice',
            value: `${totalProfit.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`,
            icon: <DollarSign className="h-4 w-4" />,
            color: totalProfit >= 0 ? 'text-primary' : 'text-orange-600'
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
                <Dialog open={isPwdDialogOpen} onOpenChange={setIsPwdDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <CreditCard className="h-4 w-4" />
                      Mots de passe
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[95vw] max-w-md">
                    <DialogHeader>
                      <DialogTitle>Gestion des mots de passe (Admin)</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div>
                        <Label>Utilisateur</Label>
                        <Select value={targetLogin} onValueChange={setTargetLogin}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Choisir un utilisateur" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.login} value={u.login}>
                                {u.login} ({u.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="new-password">Nouveau mot de passe</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimum 6 caractères"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsPwdDialogOpen(false)}>
                          Annuler
                        </Button>
                        <Button type="submit">Enregistrer</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
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

      {/* Stats Grid - Redesign professionnel */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 border-blue-200 dark:border-blue-800 hover:shadow-lg transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Camions Actifs</CardTitle>
            <div className="p-2 bg-blue-200 dark:bg-blue-900 rounded-lg">
              <Truck className="h-5 w-5 text-blue-700 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-3xl font-bold text-blue-900 dark:text-blue-300">{activeTrucks}<span className="text-lg text-muted-foreground">/{trucks.length}</span></div>
            <p className="text-xs text-muted-foreground mt-2">
              {((activeTrucks / trucks.length) * 100).toFixed(0)}% de la flotte opérationnelle
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 border-green-200 dark:border-green-800 hover:shadow-lg transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">Chiffre d&apos;affaires</CardTitle>
            <div className="p-2 bg-green-200 dark:bg-green-900 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-700 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-3xl font-bold text-green-900 dark:text-green-300">{totalRecettes.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {totalRecettes.toLocaleString('fr-FR')} FCFA
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/30 border-red-200 dark:border-red-800 hover:shadow-lg transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Dépenses Totales</CardTitle>
            <div className="p-2 bg-red-200 dark:bg-red-900 rounded-lg">
              <DollarSign className="h-5 w-5 text-red-700 dark:text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-3xl font-bold text-red-900 dark:text-red-300">{totalDepenses.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {totalDepenses.toLocaleString('fr-FR')} FCFA
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br ${totalProfit >= 0 ? 'from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 border-purple-200 dark:border-purple-800' : 'from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30 border-orange-200 dark:border-orange-800'} hover:shadow-lg transition-all duration-300`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className={`text-sm font-medium ${totalProfit >= 0 ? 'text-purple-700 dark:text-purple-400' : 'text-orange-700 dark:text-orange-400'}`}>
              Bénéfice Net
            </CardTitle>
            <div className={`p-2 ${totalProfit >= 0 ? 'bg-purple-200 dark:bg-purple-900' : 'bg-orange-200 dark:bg-orange-900'} rounded-lg`}>
              {totalProfit >= 0 ? (
                <TrendingUp className="h-5 w-5 text-purple-700 dark:text-purple-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-orange-700 dark:text-orange-400" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-xl sm:text-3xl font-bold ${totalProfit >= 0 ? 'text-purple-900 dark:text-purple-300' : 'text-orange-900 dark:text-orange-300'}`}>
              {totalProfit.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Marge: {profitMargin}% • {totalProfit.toLocaleString('fr-FR')} FCFA
            </p>
          </CardContent>
        </Card>
      </div>

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
            <CardTitle className="text-sm font-medium">Trajets</CardTitle>
            <Route className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Terminés</span>
                <Badge variant="default">{completedTrips}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">En cours</span>
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                  {ongoingTrips}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Planifiés</span>
                <Badge variant="outline">{plannedTrips}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Annulés</span>
                <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">
                  {cancelledTrips}
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

      {/* Graphique d'évolution mensuelle */}
      {monthlyData.some(m => m.recettes > 0 || m.depenses > 0) ? (
      <Card className="shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{EMOJI.graphique} Évolution Chiffre d&apos;affaires vs Dépenses</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Tendance sur 3 mois</p>
            </div>
            <TrendingUp className="h-8 w-8 text-primary opacity-50" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="colorRecettes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1}/>
                </linearGradient>
                <linearGradient id="colorDepenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                formatter={(value: number) => `${value.toLocaleString('fr-FR')} FCFA`}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="recettes" 
                stroke="hsl(var(--chart-2))" 
                fillOpacity={1} 
                fill="url(#colorRecettes)" 
                strokeWidth={3}
                name="Chiffre d&apos;affaires"
              />
              <Area 
                type="monotone" 
                dataKey="depenses" 
                stroke="hsl(var(--chart-1))" 
                fillOpacity={1} 
                fill="url(#colorDepenses)" 
                strokeWidth={3}
                name="Dépenses"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      ) : null}

      {/* Recent Activity - Amélioré */}
      <Card className="shadow-md hover:shadow-lg transition-shadow">
        <CardHeader className="bg-gradient-to-br from-background to-muted/20 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{EMOJI.camion} Derniers Trajets</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">5 trajets les plus récents (tous statuts)</p>
            </div>
            <Route className="h-8 w-8 text-accent opacity-50" />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {recentTripsSorted.slice(0, 5).map((trip, index) => {
              const getStatusColor = (status: string) => {
                switch (status) {
                  case 'termine': return 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400';
                  case 'en_cours': return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
                  case 'planifie': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400';
                  case 'annule': return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300';
                  default: return 'bg-gray-100 text-gray-700 dark:bg-gray-950/30 dark:text-gray-400';
                }
              };

              const getStatusLabel = (status: string) => {
                switch (status) {
                  case 'termine': return 'Terminé';
                  case 'en_cours': return 'En cours';
                  case 'planifie': return 'Planifié';
                  case 'annule': return 'Annulé';
                  default: return status;
                }
              };

              return (
                <div 
                  key={trip.id} 
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/50 hover:border-primary/30 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0 group-hover:scale-110 transition-transform">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        <p className="font-semibold text-foreground text-sm sm:text-base truncate">{trip.origine} → {trip.destination}</p>
                        <Badge className={`text-xs flex-shrink-0 ${getStatusColor(trip.statut)}`}>
                          {getStatusLabel(trip.statut)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        <span>{EMOJI.date} {new Date(trip.dateDepart).toLocaleDateString('fr-FR')}</span>
                        {trip.client && <span className="hidden sm:inline">{EMOJI.personne} {trip.client}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base sm:text-xl font-bold text-primary group-hover:scale-110 transition-transform inline-block">
                      {calculatePaidAmountForTrip(trip.id, invoices).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-xs text-muted-foreground">FCFA</p>
                  </div>
                </div>
              );
            })}
            {trips.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Aucun trajet enregistré</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
