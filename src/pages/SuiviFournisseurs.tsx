/** Grand livre / suivi fournisseurs — style Excel (DATE, NOMS, QLTI, QTES…). */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { ExportButtons } from '@/components/ExportButtons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  buildSupplierLedgerRows,
  summarizeSupplierLedger,
  type SupplierLedgerRow,
} from '@/lib/supplier-ledger';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { frCollator, stableSort } from '@/lib/list-sort';
import { BookOpen, Loader2, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';

const ALL = '__all__';

function formatFcfa(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

function formatDateFr(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
}

function qltiTone(qlti: string): string {
  const q = qlti.toUpperCase();
  if (q.includes('42.5') || q.includes('42,5')) {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
  }
  if (q.includes('32.5') || q.includes('32,5')) {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
  return 'bg-muted text-foreground';
}

export default function SuiviFournisseurs() {
  const {
    thirdParties,
    supplierLoadings,
    expenses,
    invoices,
    articles,
    trucks,
    updateSupplierLoading,
  } = useApp();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [fournisseurId, setFournisseurId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showRetracted, setShowRetracted] = useState(false);

  const fournisseurs = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'fournisseur' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const rows = useMemo(
    () =>
      buildSupplierLedgerRows({
        loadings: supplierLoadings,
        expenses,
        invoices,
        articles,
        trucks,
        fournisseurs,
        includeRetracted: showRetracted,
        fournisseurId: fournisseurId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [
      supplierLoadings,
      expenses,
      invoices,
      articles,
      trucks,
      fournisseurs,
      showRetracted,
      fournisseurId,
      dateFrom,
      dateTo,
    ],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.noms.toLowerCase().includes(q) ||
        r.fournisseurNom.toLowerCase().includes(q) ||
        r.qlti.toLowerCase().includes(q) ||
        r.atc.toLowerCase().includes(q) ||
        r.immatriculation.toLowerCase().includes(q) ||
        r.obs.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const summary = useMemo(() => summarizeSupplierLedger(filtered), [filtered]);

  const retractAchat = (row: SupplierLedgerRow) => {
    if (!row.loadingId || row.retracted) return;
    if (
      !confirm(
        `Rétracter l’achat de bon « ${row.atc || row.qlti || row.noms} » ?\nLe débit disparaîtra du suivi.`,
      )
    ) {
      return;
    }
    void withGuard(async () => {
      try {
        await updateSupplierLoading(row.loadingId!, { statut: 'annule' });
        toast.success('Achat rétracté (bon annulé).');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur rétractation.');
      }
    });
  };

  const exportColumns = [
    { header: 'DATE', value: (r: SupplierLedgerRow) => formatDateFr(r.date) },
    {
      header: 'NOMS',
      value: (r: SupplierLedgerRow) =>
        r.noms || (fournisseurId ? '' : r.fournisseurNom) || '',
    },
    { header: 'QLTI', value: (r: SupplierLedgerRow) => r.qlti },
    {
      header: 'QTES',
      value: (r: SupplierLedgerRow) =>
        r.qtes != null ? r.qtes.toLocaleString('fr-FR') : '',
    },
    {
      header: 'PX UNI',
      value: (r: SupplierLedgerRow) =>
        r.pxUni != null ? formatFcfa(r.pxUni) : '',
    },
    {
      header: 'DEBIT',
      value: (r: SupplierLedgerRow) => (r.debit ? formatFcfa(r.debit) : ''),
    },
    {
      header: 'CREDIT',
      value: (r: SupplierLedgerRow) => (r.credit ? formatFcfa(r.credit) : ''),
    },
    {
      header: 'SOLDE',
      value: (r: SupplierLedgerRow) => formatFcfa(r.solde),
    },
    { header: 'ATC', value: (r: SupplierLedgerRow) => r.atc },
    { header: 'IMMATRICULATION', value: (r: SupplierLedgerRow) => r.immatriculation },
    { header: 'OBS', value: (r: SupplierLedgerRow) => r.obs },
  ];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Suivi fournisseurs"
        description="Achats de bons (débit) et paiements (crédit), solde courant — rétractables."
        icon={BookOpen}
        gradient="from-orange-500/20 via-amber-500/10 to-transparent"
        iconColor="from-orange-600 via-amber-600 to-yellow-700"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              onExcel={() =>
                exportToExcel({
                  title: 'Suivi fournisseurs',
                  fileName: `suivi_fournisseurs_${today}.xlsx`,
                  columns: exportColumns,
                  rows: filtered,
                })
              }
              onPdf={() =>
                exportToPrintablePDF({
                  title: 'Suivi fournisseurs',
                  fileName: `suivi_fournisseurs_${today}.pdf`,
                  headerColor: '#ea580c',
                  columns: exportColumns,
                  rows: filtered,
                })
              }
            />
            <Button asChild variant="outline" size="sm">
              <Link to="/chargements">Chargements</Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col lg:flex-row flex-wrap gap-3 items-stretch lg:items-end">
            <div className="w-full lg:w-[260px] space-y-1">
              <Label className="text-xs text-muted-foreground">Fournisseur</Label>
              <ThirdPartyPicker
                options={fournisseurs}
                value={fournisseurId || ALL}
                onValueChange={(id) => setFournisseurId(id === ALL ? '' : id)}
                placeholder="Tous les fournisseurs…"
                searchPlaceholder="Nom fournisseur…"
                topChoices={[{ id: ALL, label: 'Tous les fournisseurs' }]}
              />
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher noms, qualité, ATC, immat…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-[150px] space-y-1">
              <Label className="text-xs text-muted-foreground">Du</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="w-[150px] space-y-1">
              <Label className="text-xs text-muted-foreground">Au</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border"
                checked={showRetracted}
                onChange={(e) => setShowRetracted(e.target.checked)}
              />
              Afficher rétractés
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-muted-foreground text-xs">QTES</p>
              <p className="font-semibold tabular-nums">
                {summary.qtes.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-muted-foreground text-xs">DEBIT</p>
              <p className="font-semibold tabular-nums">{formatFcfa(summary.debit)}</p>
            </div>
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-muted-foreground text-xs">CREDIT</p>
              <p className="font-semibold tabular-nums">{formatFcfa(summary.credit)}</p>
            </div>
            <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 p-3">
              <p className="text-muted-foreground text-xs">SOLDE</p>
              <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatFcfa(summary.solde)}
              </p>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead>DATE</TableHead>
                  <TableHead>NOMS</TableHead>
                  <TableHead>QLTI</TableHead>
                  <TableHead className="text-right">QTES</TableHead>
                  <TableHead className="text-right">PX UNI</TableHead>
                  <TableHead className="text-right">DEBIT</TableHead>
                  <TableHead className="text-right">CREDIT</TableHead>
                  <TableHead className="text-right">SOLDE</TableHead>
                  <TableHead>ATC</TableHead>
                  <TableHead>IMMATRICULATION</TableHead>
                  <TableHead>OBS</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="text-center text-muted-foreground py-10"
                    >
                      Aucune ligne. Les achats viennent des{' '}
                      <Link to="/chargements" className="underline">
                        Chargements
                      </Link>
                      , les crédits des dépenses / factures fournisseur.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className={r.retracted ? 'opacity-60' : undefined}
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatDateFr(r.date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.noms ||
                          (!fournisseurId ? r.fournisseurNom : '') ||
                          (r.kind === 'paiement' ? '—' : '—')}
                      </TableCell>
                      <TableCell>
                        {r.qlti ? (
                          <Badge
                            variant="secondary"
                            className={`font-normal ${qltiTone(r.qlti)}`}
                          >
                            {r.qlti}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.qtes != null ? r.qtes.toLocaleString('fr-FR') : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.pxUni != null ? formatFcfa(r.pxUni) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.debit ? formatFcfa(r.debit) : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.credit ? formatFcfa(r.credit) : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatFcfa(r.solde)}
                      </TableCell>
                      <TableCell className="tabular-nums">{r.atc || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.immatriculation || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                        {r.obs || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.kind === 'achat' && r.loadingId && !r.retracted ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            title="Rétracter l’achat"
                            disabled={isSubmitting}
                            onClick={() => retractAchat(r)}
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        ) : r.retracted ? (
                          <Badge variant="outline" className="text-[10px]">
                            Rétracté
                          </Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
