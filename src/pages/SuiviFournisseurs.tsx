/**
 * Suivi fournisseurs — achats de bons ANSA'R chez ses fournisseurs (pas les clients).
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
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  computeLineAmount,
  getArticleSupplierUnitPrice,
  listArticlesForSupplier,
} from '@/lib/article-pricing';
import { exportToExcel, exportToPrintablePDF } from '@/lib/export-utils';
import { frCollator, stableSort } from '@/lib/list-sort';
import { truckMissionLabel } from '@/lib/trip-mission-context';
import { BookOpen, Loader2, Plus, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';

const ALL = '__all__';
const todayIso = () => new Date().toISOString().slice(0, 10);

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

type AchatForm = {
  fournisseurId: string;
  dateChargement: string;
  articleId: string;
  designation: string;
  quantite: number | undefined;
  unite: string;
  prixUnitaire: number | undefined;
  montantBon: number | undefined;
  montantTouched: boolean;
  numeroBon: string;
  camionId: string;
  notes: string;
};

const emptyAchatForm = (): AchatForm => ({
  fournisseurId: '',
  dateChargement: todayIso(),
  articleId: '',
  designation: '',
  quantite: undefined,
  unite: '',
  prixUnitaire: undefined,
  montantBon: undefined,
  montantTouched: false,
  numeroBon: '',
  camionId: '',
  notes: '',
});

export default function SuiviFournisseurs() {
  const {
    thirdParties,
    supplierLoadings,
    expenses,
    invoices,
    articles,
    trucks,
    createSupplierLoading,
    updateSupplierLoading,
  } = useApp();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [fournisseurId, setFournisseurId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showRetracted, setShowRetracted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AchatForm>(emptyAchatForm);

  const fournisseurs = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'fournisseur' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const ansarTrucks = useMemo(
    () =>
      stableSort(
        trucks.filter((t) => t.flotte !== 'tjk'),
        (a, b) => frCollator.compare(truckMissionLabel(a), truckMissionLabel(b)),
      ),
    [trucks],
  );

  const articlesForSupplier = useMemo(
    () => listArticlesForSupplier(articles, form.fournisseurId),
    [articles, form.fournisseurId],
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
        r.fournisseurNom.toLowerCase().includes(q) ||
        r.qlti.toLowerCase().includes(q) ||
        r.atc.toLowerCase().includes(q) ||
        r.immatriculation.toLowerCase().includes(q) ||
        r.obs.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const summary = useMemo(() => summarizeSupplierLedger(filtered), [filtered]);

  const syncMontant = (next: Partial<AchatForm>, prev: AchatForm): AchatForm => {
    const merged = { ...prev, ...next };
    const art = merged.articleId
      ? articles.find((a) => a.id === merged.articleId)
      : undefined;
    const pu =
      next.prixUnitaire !== undefined
        ? next.prixUnitaire
        : merged.prixUnitaire ??
          (merged.fournisseurId
            ? getArticleSupplierUnitPrice(art, merged.fournisseurId)
            : undefined);
    const montantCalc = computeLineAmount(merged.quantite, pu);
    return {
      ...merged,
      prixUnitaire: pu,
      montantBon: merged.montantTouched
        ? merged.montantBon
        : (montantCalc ?? merged.montantBon),
    };
  };

  const openCreate = () => {
    setForm({
      ...emptyAchatForm(),
      fournisseurId: fournisseurId || '',
    });
    setDialogOpen(true);
  };

  const handleSaveAchat = () =>
    withGuard(async () => {
      if (!form.fournisseurId) {
        toast.error('Choisissez un fournisseur.');
        return;
      }
      if (!form.designation.trim()) {
        toast.error('Qualité / désignation requise.');
        return;
      }
      if (!form.dateChargement) {
        toast.error('Date d’achat requise.');
        return;
      }
      try {
        await createSupplierLoading({
          fournisseurId: form.fournisseurId,
          numeroBon: form.numeroBon.trim() || undefined,
          articleId: form.articleId || undefined,
          designation: form.designation.trim(),
          quantite: form.quantite,
          unite: form.unite.trim() || undefined,
          montantBon: form.montantBon,
          dateChargement: form.dateChargement,
          modeEntree: 'bon_simple',
          camionId: form.camionId || null,
          notes: form.notes.trim() || undefined,
          statut: 'en_attente_affectation',
        });
        toast.success('Achat de bon enregistré.');
        setDialogOpen(false);
        setForm(emptyAchatForm());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur enregistrement.');
      }
    });

  const retractAchat = (row: SupplierLedgerRow) => {
    if (!row.loadingId || row.retracted) return;
    if (
      !confirm(
        `Rétracter l’achat « ${row.atc || row.qlti || row.fournisseurNom} » ?\nLe débit disparaîtra du suivi.`,
      )
    ) {
      return;
    }
    void withGuard(async () => {
      try {
        await updateSupplierLoading(row.loadingId!, { statut: 'annule' });
        toast.success('Achat rétracté.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur rétractation.');
      }
    });
  };

  const exportColumns = [
    { header: 'DATE', value: (r: SupplierLedgerRow) => formatDateFr(r.date) },
    { header: 'FOURNISSEUR', value: (r: SupplierLedgerRow) => r.fournisseurNom },
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
    { header: 'N° BON', value: (r: SupplierLedgerRow) => r.atc },
    { header: 'IMMATRICULATION', value: (r: SupplierLedgerRow) => r.immatriculation },
    { header: 'OBS', value: (r: SupplierLedgerRow) => r.obs },
  ];

  const today = todayIso();

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        title="Achats fournisseurs"
        description="Renseigner les bons achetés par ANSA'R chez ses fournisseurs. Débit = achats, crédit = paiements. Aucun client."
        icon={BookOpen}
        gradient="from-orange-500/20 via-amber-500/10 to-transparent"
        iconColor="from-orange-600 via-amber-600 to-yellow-700"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              onExcel={() =>
                exportToExcel({
                  title: 'Achats fournisseurs',
                  fileName: `achats_fournisseurs_${today}.xlsx`,
                  columns: exportColumns,
                  rows: filtered,
                })
              }
              onPdf={() =>
                exportToPrintablePDF({
                  title: 'Achats fournisseurs',
                  fileName: `achats_fournisseurs_${today}.pdf`,
                  headerColor: '#ea580c',
                  columns: exportColumns,
                  rows: filtered,
                })
              }
            />
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Nouvel achat
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
                placeholder="Rechercher fournisseur, qualité, n° bon, immat…"
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
              <p className="text-muted-foreground text-xs">QTES achetées</p>
              <p className="font-semibold tabular-nums">
                {summary.qtes.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-muted-foreground text-xs">DEBIT (achats)</p>
              <p className="font-semibold tabular-nums">{formatFcfa(summary.debit)}</p>
            </div>
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-muted-foreground text-xs">CREDIT (paiements)</p>
              <p className="font-semibold tabular-nums">{formatFcfa(summary.credit)}</p>
            </div>
            <div className="rounded-md border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 p-3">
              <p className="text-muted-foreground text-xs">SOLDE dû fournisseurs</p>
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
                  <TableHead>FOURNISSEUR</TableHead>
                  <TableHead>QLTI</TableHead>
                  <TableHead className="text-right">QTES</TableHead>
                  <TableHead className="text-right">PX UNI</TableHead>
                  <TableHead className="text-right">DEBIT</TableHead>
                  <TableHead className="text-right">CREDIT</TableHead>
                  <TableHead className="text-right">SOLDE</TableHead>
                  <TableHead>N° BON</TableHead>
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
                      Aucun achat. Cliquez sur{' '}
                      <button
                        type="button"
                        className="underline font-medium text-foreground"
                        onClick={openCreate}
                      >
                        Nouvel achat
                      </button>{' '}
                      pour renseigner un bon acheté chez un fournisseur.
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
                        ) : r.kind === 'paiement' ? (
                          <span className="text-muted-foreground text-xs">Paiement</span>
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setForm(emptyAchatForm());
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouvel achat de bon fournisseur</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveAchat();
            }}
          >
            <p className="text-sm text-muted-foreground">
              Enregistre un bon acheté par ANSA'R chez un fournisseur. Pas d’affectation
              client ici — cela se fait plus tard dans Chargements si besoin.
            </p>
            <div className="space-y-1">
              <Label>Fournisseur *</Label>
              <ThirdPartyPicker
                options={fournisseurs}
                value={form.fournisseurId}
                onValueChange={(id) =>
                  setForm((f) =>
                    syncMontant(
                      {
                        fournisseurId: id,
                        articleId: '',
                        montantTouched: false,
                      },
                      f,
                    ),
                  )
                }
                placeholder="Choisir un fournisseur…"
                searchPlaceholder="Nom fournisseur…"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="achat-date">Date d’achat *</Label>
                <Input
                  id="achat-date"
                  type="date"
                  required
                  value={form.dateChargement}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dateChargement: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="achat-bon">N° bon</Label>
                <Input
                  id="achat-bon"
                  value={form.numeroBon}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, numeroBon: e.target.value }))
                  }
                  placeholder="Ex. ATC / n° fournisseur"
                />
              </div>
            </div>
            {articlesForSupplier.length > 0 && (
              <div className="space-y-1">
                <Label>Article catalogue</Label>
                <Select
                  value={form.articleId || '__none__'}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      setForm((f) =>
                        syncMontant({ articleId: '', montantTouched: false }, f),
                      );
                      return;
                    }
                    const art = articles.find((a) => a.id === v);
                    setForm((f) =>
                      syncMontant(
                        {
                          articleId: v,
                          designation: art?.libelle ?? f.designation,
                          unite: art?.unite ?? f.unite,
                          montantTouched: false,
                        },
                        f,
                      ),
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Saisie libre</SelectItem>
                    {articlesForSupplier.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="achat-qlti">Qualité / désignation *</Label>
              <Input
                id="achat-qlti"
                required
                value={form.designation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, designation: e.target.value }))
                }
                placeholder="Ex. 42.5R, CPJ 45…"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="achat-qte">Quantité</Label>
                <NumberInput
                  id="achat-qte"
                  value={form.quantite}
                  allowEmpty
                  min={0}
                  onChange={(quantite) =>
                    setForm((f) => syncMontant({ quantite, montantTouched: false }, f))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="achat-unite">Unité</Label>
                <Input
                  id="achat-unite"
                  value={form.unite}
                  onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))}
                  placeholder="sacs, t…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="achat-pu">Prix unitaire</Label>
                <NumberInput
                  id="achat-pu"
                  value={form.prixUnitaire}
                  allowEmpty
                  min={0}
                  onChange={(prixUnitaire) =>
                    setForm((f) =>
                      syncMontant({ prixUnitaire, montantTouched: false }, f),
                    )
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="achat-montant">Montant (débit) FCFA</Label>
              <NumberInput
                id="achat-montant"
                value={form.montantBon}
                allowEmpty
                min={0}
                onChange={(montantBon) =>
                  setForm((f) => ({
                    ...f,
                    montantBon,
                    montantTouched: true,
                  }))
                }
              />
              {form.quantite != null && form.prixUnitaire != null && (
                <p className="text-xs text-muted-foreground">
                  Calcul auto : {form.quantite.toLocaleString('fr-FR')} ×{' '}
                  {formatFcfa(form.prixUnitaire)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Camion ANSA'R (optionnel)</Label>
              <Select
                value={form.camionId || '__none__'}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    camionId: v === '__none__' ? '' : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {ansarTrucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {truckMissionLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="achat-notes">Observations</Label>
              <Input
                id="achat-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Enregistrer l’achat
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
