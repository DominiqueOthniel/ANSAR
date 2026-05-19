import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, History, Loader2, RefreshCw, Database, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ExportButtons } from '@/components/ExportButtons';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { auditLogsApi, setApiActor, type AuditLogRow } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { runSeed, clearDemoData } from '@/lib/seed-data';
import {
  actionLabel,
  extractAuditAmount,
  formatAuditAmount,
  isMovementModule,
  moduleLabel,
} from '@/lib/audit-movements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const ALL = '_all';
const MOVEMENTS_ONLY = '_movements';

const MODULE_OPTIONS = [
  { value: ALL, label: 'Tous les modules' },
  { value: MOVEMENTS_ONLY, label: 'Mouvements financiers (tous)' },
  { value: 'bank', label: 'Banque' },
  { value: 'caisse', label: 'Caisse' },
  { value: 'expenses', label: 'Dépenses' },
  { value: 'invoices', label: 'Factures' },
  { value: 'credits', label: 'Crédits' },
  { value: 'trips', label: 'Trajets' },
  { value: 'client-orders', label: 'Commandes client' },
  { value: 'client-deliveries', label: 'Livraisons' },
  { value: 'supplier-loadings', label: 'Chargements' },
  { value: 'third-parties', label: 'Tiers' },
];

const ACTION_OPTIONS = [
  { value: ALL, label: 'Toutes les actions' },
  { value: 'CREATE', label: 'Création' },
  { value: 'UPDATE', label: 'Modification' },
  { value: 'DELETE', label: 'Suppression' },
  { value: 'ENCAISSEMENT', label: 'Encaissement' },
  { value: 'PAYMENT', label: 'Paiement' },
  { value: 'REMBOURSEMENT', label: 'Remboursement' },
];

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function actionBadgeVariant(
  action: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action === 'DELETE') return 'destructive';
  if (action === 'CREATE') return 'default';
  if (action === 'ENCAISSEMENT' || action === 'REMBOURSEMENT' || action === 'PAYMENT') {
    return 'secondary';
  }
  return 'outline';
}

export default function AuditLogs() {
  const { user } = useAuth();
  const {
    refreshTrucks,
    refreshDrivers,
    refreshTrips,
    refreshParcelExpeditions,
    refreshExpenses,
    refreshInvoices,
    refreshThirdParties,
  } = useApp();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedOp, setSeedOp] = useState<null | 'clear' | 'reload'>(null);
  const [moduleFilter, setModuleFilter] = useState(MOVEMENTS_ONLY);
  const [actionFilter, setActionFilter] = useState(ALL);
  const [actorLogin, setActorLogin] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState('500');

  const load = useCallback(async () => {
    if (user) {
      setApiActor({ login: user.login, role: user.role });
    }
    setLoading(true);
    try {
      const parsedLimit = Math.min(500, Math.max(1, parseInt(limit, 10) || 500));
      const movementOnly = moduleFilter === MOVEMENTS_ONLY;

      const data = movementOnly
        ? (
            await Promise.all(
              ['bank', 'caisse', 'expenses', 'invoices', 'credits'].map((mod) =>
                auditLogsApi.getAll({
                  module: mod,
                  action: actionFilter === ALL ? undefined : actionFilter,
                  actorLogin: actorLogin.trim() || undefined,
                  from: from || undefined,
                  to: to ? `${to}T23:59:59.999Z` : undefined,
                  limit: parsedLimit,
                }),
              ),
            )
          )
            .flat()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, parsedLimit)
        : await auditLogsApi.getAll({
            module: moduleFilter === ALL ? undefined : moduleFilter,
            action: actionFilter === ALL ? undefined : actionFilter,
            actorLogin: actorLogin.trim() || undefined,
            from: from || undefined,
            to: to ? `${to}T23:59:59.999Z` : undefined,
            limit: parsedLimit,
          });

      setRows(data);
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : 'Impossible de charger l’historique (droits admin requis).',
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, actionFilter, actorLogin, from, to, limit, user]);

  useEffect(() => {
    if (user?.role === 'admin') void load();
  }, [user?.role, load]);

  const movementStats = useMemo(() => {
    const movements = rows.filter((r) => isMovementModule(r.module));
    const encaissements = rows.filter((r) => r.action === 'ENCAISSEMENT' || r.action === 'REMBOURSEMENT');
    return { total: rows.length, movements: movements.length, encaissements: encaissements.length };
  }, [rows]);

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const refreshers = {
    refreshTrucks,
    refreshDrivers,
    refreshTrips,
    refreshParcelExpeditions,
    refreshExpenses,
    refreshInvoices,
    refreshThirdParties,
  };

  const handleClearDemo = async () => {
    if (
      !window.confirm(
        'Supprimer toutes les données ? La base sera vidée et la banque, la caisse et les créances en local seront effacées. Aucune donnée ne sera recréée automatiquement.',
      )
    ) {
      return;
    }
    setSeedOp('clear');
    setApiActor({ login: user.login, role: user.role });
    try {
      const { success, errors } = await clearDemoData(refreshers);
      if (success.length) {
        toast.success(success.join(' · '));
      }
      if (errors.length) {
        toast.error(errors.join(' · '));
      } else {
        toast.message('Données supprimées. Utilisez « Recharger le jeu de démo » pour recréer le scénario.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la suppression');
    } finally {
      setSeedOp(null);
    }
  };

  const handleReloadDemo = async () => {
    if (
      !window.confirm(
        'Recharger le jeu de données de démonstration ? Les données en base seront d’abord effacées, puis le scénario complet sera recréé (banque, caisse et créances locales incluses).',
      )
    ) {
      return;
    }
    setSeedOp('reload');
    setApiActor({ login: user.login, role: user.role });
    try {
      const { success, errors } = await runSeed(refreshers);
      if (success.length) {
        toast.success(success.join(' · '));
      }
      if (errors.length) {
        toast.error(errors.join(' · '));
      } else {
        toast.message('Parcourez Dashboard, Clients, Factures, Caisse, etc. pour voir les cas de figure.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec du rechargement démo');
    } finally {
      setSeedOp(null);
    }
  };

  const getFiltersDescription = () => {
    const parts: string[] = [];
    if (moduleFilter !== ALL) {
      parts.push(MODULE_OPTIONS.find((o) => o.value === moduleFilter)?.label ?? moduleFilter);
    }
    if (actionFilter !== ALL) {
      parts.push(ACTION_OPTIONS.find((o) => o.value === actionFilter)?.label ?? actionFilter);
    }
    if (actorLogin.trim()) parts.push(`Utilisateur: ${actorLogin.trim()}`);
    if (from) parts.push(`Du: ${from}`);
    if (to) parts.push(`Au: ${to}`);
    parts.push(`Limite: ${limit}`);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  };

  const auditColumns = [
    { header: 'Date', value: (r: AuditLogRow) => formatDateTime(r.createdAt) },
    { header: 'Module', value: (r: AuditLogRow) => moduleLabel(r.module) },
    { header: 'Action', value: (r: AuditLogRow) => actionLabel(r.action) },
    { header: 'Montant', value: (r: AuditLogRow) => formatAuditAmount(extractAuditAmount(r)) },
    { header: 'Utilisateur', value: (r: AuditLogRow) => r.actorLogin ?? '—' },
    { header: 'Rôle', value: (r: AuditLogRow) => r.actorRole ?? '—' },
    { header: 'Résumé', value: (r: AuditLogRow) => r.summary ?? '—' },
    { header: 'ID entité', value: (r: AuditLogRow) => r.entityId ?? '—' },
  ];

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Historique des mouvements',
      fileName: `mouvements_${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName: 'Mouvements',
      filtersDescription: getFiltersDescription(),
      columns: auditColumns,
      rows,
    });
    toast.success('Export Excel généré');
  };

  const handleExportPDF = () => {
    exportToPrintablePDF({
      title: 'Historique des mouvements',
      fileName: `mouvements_${new Date().toISOString().split('T')[0]}.pdf`,
      filtersDescription: getFiltersDescription(),
      headerColor: '#0f766e',
      accentColor: '#0f766e',
      columns: auditColumns,
      rows,
    });
    toast.success('Export PDF — enregistrez via la fenêtre d’impression');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historique des mouvements"
        description="Journal complet : banque, caisse, dépenses, factures, encaissements, crédits, commandes et livraisons. Chaque opération est enregistrée avec l’utilisateur et le montant."
        icon={History}
        actions={<ExportButtons onExcel={handleExportExcel} onPdf={handleExportPDF} size="sm" />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Entrées affichées</p>
            <p className="text-2xl font-semibold tabular-nums">{movementStats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Mouvements financiers</p>
            <p className="text-2xl font-semibold tabular-nums">{movementStats.movements}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Encaissements / remboursements</p>
            <p className="text-2xl font-semibold tabular-nums">{movementStats.encaissements}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Données de démonstration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Supprimer</span> vide la base et les caches locaux (banque,
            caisse), sans recréer de données.
            <span className="font-medium text-foreground"> Recharger le jeu de démo</span> efface puis recrée un
            scénario riche : clients avec plafonds, trajets variés, expéditions colis, factures, banque, caisse et
            caches locaux.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={seedOp !== null}
              onClick={() => void handleClearDemo()}
            >
              {seedOp === 'clear' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="ml-2">Supprimer toutes les données</span>
            </Button>
            <Button type="button" variant="secondary" disabled={seedOp !== null} onClick={() => void handleReloadDemo()}>
              {seedOp === 'reload' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              <span className="ml-2">Recharger le jeu de démo</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-2">
              <Label>Module</Label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Module" />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-actor">Utilisateur (login)</Label>
              <Input
                id="audit-actor"
                placeholder="ex. comptable"
                value={actorLogin}
                onChange={(e) => setActorLogin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-from">Du</Label>
              <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-to">Au</Label>
              <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-limit">Limite</Label>
              <Input
                id="audit-limit"
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Actualiser</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mouvements enregistrés ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Résumé</TableHead>
                  <TableHead className="w-[100px]">Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin inline mr-2" />
                      Chargement…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      Aucun mouvement pour ces critères. Les nouvelles opérations apparaîtront ici automatiquement.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  rows.map((r) => {
                    const amount = extractAuditAmount(r);
                    const isIn = r.action === 'ENCAISSEMENT' || r.action === 'REMBOURSEMENT' || r.module === 'caisse' && (r.afterData as { type?: string } | null)?.type === 'entree';
                    return (
                    <TableRow key={r.id} className={isMovementModule(r.module) ? '' : 'opacity-90'}>
                      <TableCell className="whitespace-nowrap text-xs font-mono">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isMovementModule(r.module) ? 'default' : 'outline'}>
                          {moduleLabel(r.module)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionBadgeVariant(r.action)}>{actionLabel(r.action)}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums whitespace-nowrap">
                        {amount != null ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            {isIn ? (
                              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                            ) : r.action === 'DELETE' ? null : (
                              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {formatAuditAmount(amount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.actorLogin ?? '—'}
                        {r.actorRole ? (
                          <span className="text-muted-foreground text-xs block">({r.actorRole})</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[320px] text-sm">
                        <span className="line-clamp-2">{r.summary ?? '—'}</span>
                        {r.entityId ? (
                          <span className="text-[10px] text-muted-foreground font-mono block truncate">
                            {r.entityId}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" type="button">
                              JSON
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Détail du mouvement</DialogTitle>
                              <DialogDescription>
                                Données avant / après enregistrement dans le journal.
                              </DialogDescription>
                            </DialogHeader>
                            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(
                                { beforeData: r.beforeData, afterData: r.afterData },
                                null,
                                2,
                              )}
                            </pre>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                  })}
              </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
