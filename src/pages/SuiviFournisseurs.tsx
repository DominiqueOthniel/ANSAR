/**
 * Achats fournisseurs — récap des bons créés dans Chargements
 * (mouvements ANSA'R ↔ fournisseurs uniquement).
 */
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
  buildSupplierLoadingRecapRows,
  summarizeSupplierLoadingRecap,
  type SupplierLoadingRecapRow,
} from '@/lib/supplier-ledger';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { frCollator, stableSort } from '@/lib/list-sort';
import { BookOpen, Container, Loader2, RotateCcw, Search } from 'lucide-react';
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
  const { thirdParties, supplierLoadings, articles, trucks, updateSupplierLoading } =
    useApp();
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
      buildSupplierLoadingRecapRows({
        loadings: supplierLoadings,
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
        r.fournisseurNom.toLowerCase().includes(q) ||
        r.qlti.toLowerCase().includes(q) ||
        r.numeroBon.toLowerCase().includes(q) ||
        r.immatriculation.toLowerCase().includes(q) ||
        r.obs.toLowerCase().includes(q) ||
        r.modeEntree.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const summary = useMemo(
    () => summarizeSupplierLoadingRecap(filtered),
    [filtered],
  );

  const retractAchat = (row: SupplierLoadingRecapRow) => {
    if (!row.loadingId || row.retracted) return;
    if (
      !confirm(
        `Annuler le bon « ${row.numeroBon || row.qlti || row.fournisseurNom} » ?\nIl disparaîtra du récap (sauf si « Afficher rétractés »).`,
      )
    ) {
      return;
    }
    void withGuard(async () => {
      try {
        await updateSupplierLoading(row.loadingId, { statut: 'annule' });
        toast.success('Bon annulé.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur annulation.');
      }
    });
  };

  const exportColumns = [
    { header: 'DATE', value: (r: SupplierLoadingRecapRow) => formatDateFr(r.date) },
    {
      header: 'FOURNISSEUR',
      value: (r: SupplierLoadingRecapRow) => r.fournisseurNom,
    },
    { header: 'QLTI', value: (r: SupplierLoadingRecapRow) => r.qlti },
    {
      header: 'QTES',
      value: (r: SupplierLoadingRecapRow) =>
        r.qtes != null
          ? `${r.qtes.toLocaleString('fr-FR')}${r.unite ? ` ${r.unite}` : ''}`
          : '',
    },
    {
      header: 'PX UNI',
      value: (r: SupplierLoadingRecapRow) =>
        r.pxUni != null ? formatFcfa(r.pxUni) : '',
    },
    {
      header: 'MONTANT',
      value: (r: SupplierLoadingRecapRow) =>
        r.montant ? formatFcfa(r.montant) : '',
    },
    { header: 'N° BON', value: (r: SupplierLoadingRecapRow) => r.numeroBon },
    {
      header: 'IMMATRICULATION',
      value: (r: SupplierLoadingRecapRow) => r.immatriculation,
    },
    { header: 'MODE', value: (r: SupplierLoadingRecapRow) => r.modeEntree },
    { header: 'STATUT', value: (r: SupplierLoadingRecapRow) => r.statutLabel },
    { header: 'OBS', value: (r: SupplierLoadingRecapRow) => r.obs },
  ];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Achats fournisseurs"
        description="Récapitulatif des bons créés dans Chargements — mouvements ANSA'R chez ses fournisseurs."
        icon={BookOpen}
        gradient="from-orange-500/20 via-amber-500/10 to-transparent"
        iconColor="from-orange-600 via-amber-600 to-yellow-700"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              onExcel={() =>
                exportToExcel({
                  title: 'Achats fournisseurs (chargements)',
                  fileName: `achats_fournisseurs_${today}.xlsx`,
                  columns: exportColumns,
                  rows: filtered,
                })
              }
              onPdf={() =>
                exportToPrintablePDF({
                  title: 'Achats fournisseurs (chargements)',
                  fileName: `achats_fournisseurs_${today}.pdf`,
                  headerColor: '#ea580c',
                  columns: exportColumns,
                  rows: filtered,
                })
              }
            />
            <Button asChild size="sm">
              <Link to="/chargements">
                <Container className="h-4 w-4 mr-1" />
                Créer un bon
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Les lignes de cet écran viennent uniquement des{' '}
            <Link to="/chargements" className="underline font-medium text-foreground">
              bons de chargement
            </Link>{' '}
            (date, fournisseur, qualité, quantité, valeur, n° bon). Aucune donnée
            client ni paiement caisse ici.
          </p>

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
                placeholder="Fournisseur, qualité, n° bon, immat…"
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
              Afficher annulés
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-muted-foreground text-xs">Bons</p>
              <p className="font-semibold tabular-nums">{summary.n}</p>
            </div>
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-muted-foreground text-xs">QTES</p>
              <p className="font-semibold tabular-nums">
                {summary.qtes.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 p-3">
              <p className="text-muted-foreground text-xs">Total achats (valeur bons)</p>
              <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatFcfa(summary.montant)} FCFA
              </p>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead>DATE</TableHead>
                  <TableHead>FOURNISSEUR</TableHead>
                  <TableHead>QLTI</TableHead>
                  <TableHead className="text-right">QTES</TableHead>
                  <TableHead className="text-right">PX UNI</TableHead>
                  <TableHead className="text-right">MONTANT</TableHead>
                  <TableHead>N° BON</TableHead>
                  <TableHead>IMMAT</TableHead>
                  <TableHead>MODE</TableHead>
                  <TableHead>STATUT</TableHead>
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
                      Aucun bon. Créez-en un dans{' '}
                      <Link to="/chargements" className="underline font-medium">
                        Chargements
                      </Link>
                      .
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
                        <Link
                          to={`/tiers?id=${r.fournisseurId}`}
                          className="hover:underline text-primary"
                        >
                          {r.fournisseurNom || '—'}
                        </Link>
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
                        {r.qtes != null
                          ? `${r.qtes.toLocaleString('fr-FR')}${r.unite ? ` ${r.unite}` : ''}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.pxUni != null ? formatFcfa(r.pxUni) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {r.montant ? `${formatFcfa(r.montant)}` : '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.numeroBon || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.immatriculation || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.modeEntree || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-[10px]">
                          {r.statutLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {r.obs || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {!r.retracted ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            title="Annuler le bon"
                            disabled={isSubmitting}
                            onClick={() => retractAchat(r)}
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Annulé
                          </Badge>
                        )}
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
