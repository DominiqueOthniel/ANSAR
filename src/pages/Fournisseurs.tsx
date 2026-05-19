import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import PageHeader from '@/components/PageHeader';
import { PAGE_FOURNISSEURS_DESCRIPTION } from '@/lib/metier-activite';
import {
  buildGlobalSupplierFeed,
  buildSupplierSummaries,
  formatSupplierActivityKindFr,
  formatSupplierEtatFr,
  supplierEtatBadgeVariant,
  type SupplierEtat,
  type SupplierSummary,
} from '@/lib/supplier-activity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Search,
  Package,
  Receipt,
  Truck,
  Tags,
  AlertTriangle,
  Activity,
  ExternalLink,
  Container,
} from 'lucide-react';
import { frCollator, stableSort } from '@/lib/list-sort';
import { cn } from '@/lib/utils';

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

function kindIcon(kind: string) {
  switch (kind) {
    case 'chargement':
      return <Package className="h-4 w-4 text-lime-600" />;
    case 'depense':
      return <Receipt className="h-4 w-4 text-orange-600" />;
    case 'transport_client':
      return <Truck className="h-4 w-4 text-blue-600" />;
    case 'tarif_article':
      return <Tags className="h-4 w-4 text-amber-600" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

export default function Fournisseurs() {
  const { thirdParties, supplierLoadings, expenses, clientDeliveries, articles } = useApp();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [filterEtat, setFilterEtat] = useState<SupplierEtat | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams.get('id'),
  );
  const [viewMode, setViewMode] = useState<'fournisseur' | 'fil'>('fournisseur');

  const fournisseurs = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'fournisseur' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const summaries = useMemo(
    () =>
      buildSupplierSummaries({
        fournisseurs,
        supplierLoadings,
        expenses,
        clientDeliveries,
        articles,
      }),
    [fournisseurs, supplierLoadings, expenses, clientDeliveries, articles],
  );

  const globalFeed = useMemo(() => buildGlobalSupplierFeed(summaries), [summaries]);

  const kpis = useMemo(() => {
    const alerte = summaries.filter((s) => s.etat === 'alerte').length;
    const bonsAttente = summaries.reduce((n, s) => n + s.chargementsEnAttente, 0);
    const depenses = summaries.reduce((n, s) => n + s.montantDepensesRecentes, 0);
    const transports = summaries.reduce((n, s) => n + s.transportsDirectClient, 0);
    return { alerte, bonsAttente, depenses, transports, total: summaries.length };
  }, [summaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = stableSort(summaries, (a, b) => {
      const prio = { alerte: 0, actif: 1, calme: 2 };
      const p = prio[a.etat] - prio[b.etat];
      if (p !== 0) return p;
      return frCollator.compare(a.nom, b.nom);
    });
    if (filterEtat !== 'all') list = list.filter((s) => s.etat === filterEtat);
    if (q) {
      list = list.filter(
        (s) =>
          s.nom.toLowerCase().includes(q) ||
          s.activites.some(
            (a) =>
              a.label.toLowerCase().includes(q) ||
              (a.detail ?? '').toLowerCase().includes(q),
          ),
      );
    }
    return list;
  }, [summaries, search, filterEtat]);

  const selected: SupplierSummary | undefined = useMemo(
    () => summaries.find((s) => s.fournisseurId === selectedId),
    [summaries, selectedId],
  );

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].fournisseurId);
    }
  }, [filtered, selectedId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fournisseurs"
        description={PAGE_FOURNISSEURS_DESCRIPTION}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/chargements">
                <Container className="h-4 w-4 mr-1" />
                Bons de chargement
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/tiers">
                <Building2 className="h-4 w-4 mr-1" />
                Fiches tiers
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Fournisseurs</p>
            <p className="text-2xl font-bold">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card className={kpis.alerte > 0 ? 'border-destructive/50' : ''}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              À traiter
            </p>
            <p className="text-2xl font-bold text-destructive">{kpis.alerte}</p>
            <p className="text-xs text-muted-foreground">{kpis.bonsAttente} bon(s) non affecté(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Dépenses (90 j.)</p>
            <p className="text-lg font-bold">{formatFcfa(kpis.depenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Transports → client</p>
            <p className="text-2xl font-bold">{kpis.transports}</p>
            <p className="text-xs text-muted-foreground">facturés par le fournisseur</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher fournisseur ou mouvement…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filterEtat}
          onValueChange={(v) => setFilterEtat(v as SupplierEtat | 'all')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="État" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les états</SelectItem>
            <SelectItem value="alerte">À traiter</SelectItem>
            <SelectItem value="actif">Actifs</SelectItem>
            <SelectItem value="calme">Calmes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'fournisseur' | 'fil')}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fournisseur">Par fournisseur</SelectItem>
            <SelectItem value="fil">Fil global des mouvements</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {viewMode === 'fil' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Mouvements récents (tous fournisseurs)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {globalFeed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
            ) : (
              <ul className="space-y-2">
                {globalFeed.map((a) => (
                  <li
                    key={`${a.fournisseurId}-${a.id}`}
                    className="flex gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    {kindIcon(a.kind)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        <Link
                          to={`/tiers?id=${a.fournisseurId}`}
                          className="text-primary hover:underline"
                        >
                          {a.fournisseurNom}
                        </Link>
                        {' · '}
                        {a.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatSupplierActivityKindFr(a.kind)}
                        {a.date ? ` · ${a.date}` : ''}
                        {a.statut ? ` · ${a.statut}` : ''}
                        {a.detail ? ` — ${a.detail}` : ''}
                        {a.amount != null ? ` · ${formatFcfa(a.amount)}` : ''}
                      </p>
                    </div>
                    {a.linkTo && (
                      <Button variant="ghost" size="icon" className="shrink-0" asChild>
                        <Link to={a.linkTo}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">État des fournisseurs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="max-h-[520px] overflow-y-auto divide-y">
                {filtered.length === 0 ? (
                  <li className="px-4 py-8 text-sm text-muted-foreground text-center">
                    Aucun fournisseur.
                  </li>
                ) : (
                  filtered.map((s) => (
                    <li key={s.fournisseurId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.fournisseurId)}
                        className={cn(
                          'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors',
                          selectedId === s.fournisseurId && 'bg-muted',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-sm">{s.nom}</span>
                          <Badge variant={supplierEtatBadgeVariant(s.etat)} className="shrink-0 text-xs">
                            {formatSupplierEtatFr(s.etat)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                          {s.chargementsTotal > 0 && (
                            <span>{s.chargementsTotal} bon(s)</span>
                          )}
                          {s.chargementsEnAttente > 0 && (
                            <span className="text-destructive font-medium">
                              {s.chargementsEnAttente} non affecté(s)
                            </span>
                          )}
                          {s.depensesRecentes > 0 && (
                            <span>{s.depensesRecentes} dépense(s)</span>
                          )}
                          {s.transportsDirectClient > 0 && (
                            <span>{s.transportsDirectClient} transport → client</span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selected ? `Interactions — ${selected.nom}` : 'Sélectionnez un fournisseur'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Choisissez un fournisseur pour voir ses bons, dépenses, transports facturés au
                  client et tarifs articles.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg border p-2">
                      <p className="text-lg font-bold">{selected.chargementsTotal}</p>
                      <p className="text-xs text-muted-foreground">Bons actifs</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-lg font-bold text-destructive">
                        {selected.chargementsEnAttente}
                      </p>
                      <p className="text-xs text-muted-foreground">Non affectés</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-lg font-bold">{selected.depensesRecentes}</p>
                      <p className="text-xs text-muted-foreground">Dépenses 90 j.</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-lg font-bold">{selected.transportsDirectClient}</p>
                      <p className="text-xs text-muted-foreground">Transport → client</p>
                    </div>
                  </div>

                  {selected.chargementsEnAttente > 0 && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <span>
                        {selected.chargementsEnAttente} bon(s) en attente d’affectation aux
                        commandes clients.{' '}
                        <Link to="/chargements" className="text-primary font-medium hover:underline">
                          Affecter dans Chargements
                        </Link>
                      </span>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Fil des mouvements
                    </p>
                    {selected.activites.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune interaction enregistrée.</p>
                    ) : (
                      <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                        {selected.activites.map((a) => (
                          <li
                            key={a.id}
                            className="flex gap-3 rounded-lg border px-3 py-2 text-sm"
                          >
                            {kindIcon(a.kind)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{a.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatSupplierActivityKindFr(a.kind)}
                                {a.date ? ` · ${a.date}` : ''}
                                {a.statut ? ` · ${a.statut}` : ''}
                                {a.detail ? ` — ${a.detail}` : ''}
                                {a.amount != null ? ` · ${formatFcfa(a.amount)}` : ''}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/tiers?id=${selected.fournisseurId}`}>Fiche tiers</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/chargements`}>Voir les bons</Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
