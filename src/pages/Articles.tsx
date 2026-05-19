import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, Article } from '@/contexts/AppContext';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import PageHeader from '@/components/PageHeader';
import { PAGE_ARTICLES_DESCRIPTION } from '@/lib/metier-activite';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ThirdPartyPicker } from '@/components/ThirdPartyPicker';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Edit, Trash2, Search, ChevronDown, Boxes, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { frCollator, stableSort } from '@/lib/list-sort';

export default function Articles() {
  const {
    articles,
    thirdParties,
    createArticle,
    updateArticle,
    deleteArticle,
    createArticleSupplierPrice,
    updateArticleSupplierPrice,
    deleteArticleSupplierPrice,
  } = useApp();
  const { isSubmitting, withGuard } = useSubmitGuard();

  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [articleForm, setArticleForm] = useState({
    libelle: '',
    unite: 'unité',
    actif: true,
    prixVente: undefined as number | undefined,
  });

  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceArticleId, setPriceArticleId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceForm, setPriceForm] = useState({
    fournisseurId: '',
    prixUnitaire: 0,
    notes: '',
  });

  const fournisseursFiches = useMemo(
    () =>
      stableSort(
        thirdParties.filter((tp) => tp.type === 'fournisseur' && tp.nom.trim()),
        (a, b) => frCollator.compare(a.nom, b.nom),
      ),
    [thirdParties],
  );

  const sortedArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = stableSort(articles, (a, b) => frCollator.compare(a.libelle, b.libelle));
    if (q) {
      list = list.filter((a) => {
        const inArticle = a.libelle.toLowerCase().includes(q) || a.unite.toLowerCase().includes(q);
        const inPrices = (a.supplierPrices ?? []).some(
          (p) =>
            (p.fournisseurNom ?? '').toLowerCase().includes(q) ||
            String(p.prixUnitaire).includes(q),
        );
        return inArticle || inPrices;
      });
    }
    return list;
  }, [articles, search]);

  const resetArticleForm = () => {
    setArticleForm({ libelle: '', unite: 'unité', actif: true, prixVente: undefined });
    setEditingArticle(null);
  };

  const openCreateArticle = () => {
    resetArticleForm();
    setArticleDialogOpen(true);
  };

  const openEditArticle = (a: Article) => {
    setEditingArticle(a);
    setArticleForm({
      libelle: a.libelle,
      unite: a.unite || 'unité',
      actif: a.actif !== false,
      prixVente: a.prixVente,
    });
    setArticleDialogOpen(true);
  };

  const handleArticleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const libelle = articleForm.libelle.trim();
    if (!libelle) {
      toast.error('Le libellé de l’article est obligatoire.');
      return;
    }
    await withGuard(async () => {
      try {
        if (editingArticle) {
          await updateArticle(editingArticle.id, {
            libelle,
            unite: articleForm.unite.trim() || 'unité',
            actif: articleForm.actif,
            prixVente: articleForm.prixVente,
          });
          toast.success('Article mis à jour');
        } else {
          await createArticle({
            libelle,
            unite: articleForm.unite.trim() || 'unité',
            actif: articleForm.actif,
            prixVente: articleForm.prixVente,
          });
          toast.success('Article ajouté');
        }
        setArticleDialogOpen(false);
        resetArticleForm();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement');
      }
    });
  };

  const handleDeleteArticle = async (a: Article) => {
    if (
      !confirm(
        `Supprimer l’article « ${a.libelle} » et tous ses tarifs fournisseurs ?`,
      )
    ) {
      return;
    }
    await withGuard(async () => {
      try {
        await deleteArticle(a.id);
        if (expandedId === a.id) setExpandedId(null);
        toast.success('Article supprimé');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Suppression impossible');
      }
    });
  };

  const openAddPrice = (articleId: string) => {
    setPriceArticleId(articleId);
    setEditingPriceId(null);
    setPriceForm({ fournisseurId: '', prixUnitaire: 0, notes: '' });
    setPriceDialogOpen(true);
  };

  const openEditPrice = (
    articleId: string,
    price: NonNullable<Article['supplierPrices']>[number],
  ) => {
    setPriceArticleId(articleId);
    setEditingPriceId(price.id);
    setPriceForm({
      fournisseurId: price.fournisseurId,
      prixUnitaire: price.prixUnitaire,
      notes: price.notes ?? '',
    });
    setPriceDialogOpen(true);
  };

  const handlePriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceArticleId) return;
    if (!priceForm.fournisseurId) {
      toast.error('Sélectionnez un fournisseur.');
      return;
    }
    if (priceForm.prixUnitaire <= 0) {
      toast.error('Le prix unitaire doit être supérieur à 0.');
      return;
    }
    await withGuard(async () => {
      try {
        if (editingPriceId) {
          await updateArticleSupplierPrice(editingPriceId, {
            fournisseurId: priceForm.fournisseurId,
            prixUnitaire: priceForm.prixUnitaire,
            notes: priceForm.notes.trim() || undefined,
          });
          toast.success('Tarif mis à jour');
        } else {
          await createArticleSupplierPrice(priceArticleId, {
            fournisseurId: priceForm.fournisseurId,
            prixUnitaire: priceForm.prixUnitaire,
            notes: priceForm.notes.trim() || undefined,
          });
          toast.success('Tarif forfaitaire enregistré');
        }
        setPriceDialogOpen(false);
        setExpandedId(priceArticleId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement');
      }
    });
  };

  const handleDeletePrice = async (priceId: string, libelle: string, fournisseur: string) => {
    if (!confirm(`Retirer le tarif « ${libelle} » chez ${fournisseur} ?`)) return;
    await withGuard(async () => {
      try {
        await deleteArticleSupplierPrice(priceId);
        toast.success('Tarif supprimé');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Suppression impossible');
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Articles"
        description={PAGE_ARTICLES_DESCRIPTION}
        icon={Boxes}
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Catalogue & tarifs fournisseurs</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher article ou fournisseur…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Dialog open={articleDialogOpen} onOpenChange={setArticleDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" onClick={openCreateArticle}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvel article
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingArticle ? 'Modifier l’article' : 'Nouvel article'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleArticleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="art-libelle">Libellé</Label>
                    <Input
                      id="art-libelle"
                      value={articleForm.libelle}
                      onChange={(e) =>
                        setArticleForm((p) => ({ ...p, libelle: e.target.value }))
                      }
                      placeholder="Ex. Sac de ciment 50 kg"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="art-unite">Unité</Label>
                    <Input
                      id="art-unite"
                      value={articleForm.unite}
                      onChange={(e) =>
                        setArticleForm((p) => ({ ...p, unite: e.target.value }))
                      }
                      placeholder="sac, tonne, litre…"
                    />
                  </div>
                  <div>
                    <Label htmlFor="art-prix-vente">Prix de vente (FCFA / unité)</Label>
                    <NumberInput
                      id="art-prix-vente"
                      min={0}
                      value={articleForm.prixVente}
                      onChange={(v) => setArticleForm((p) => ({ ...p, prixVente: v }))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Utilisé pour le calcul automatique des commandes clients.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="art-actif"
                      checked={articleForm.actif}
                      onChange={(e) =>
                        setArticleForm((p) => ({ ...p, actif: e.target.checked }))
                      }
                      className="rounded border-input"
                    />
                    <Label htmlFor="art-actif" className="font-normal cursor-pointer">
                      Article actif (proposé dans les dépenses)
                    </Label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setArticleDialogOpen(false)}
                    >
                      Annuler
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Enregistrer
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Créez d’abord les fiches{' '}
            <Link to="/tiers" className="text-primary underline-offset-2 hover:underline">
              fournisseurs
            </Link>
            , puis déclarez sous chaque article le prix unitaire chez chaque dépôt (ex. Dangote).
          </p>

          {sortedArticles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {search.trim()
                ? 'Aucun article ne correspond à la recherche.'
                : 'Aucun article. Ajoutez le premier produit du catalogue.'}
            </p>
          ) : (
            <div className="space-y-3">
              {sortedArticles.map((article) => {
                const prices = article.supplierPrices ?? [];
                const isOpen = expandedId === article.id;
                return (
                  <Collapsible
                    key={article.id}
                    open={isOpen}
                    onOpenChange={(open) => setExpandedId(open ? article.id : null)}
                  >
                    <Card className="border-muted/60">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors rounded-t-lg"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            />
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{article.libelle}</p>
                              <p className="text-xs text-muted-foreground">
                                Unité : {article.unite}
                                {' · '}
                                {prices.length} tarif{prices.length !== 1 ? 's' : ''} fournisseur
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {article.actif === false ? (
                              <Badge variant="secondary">Inactif</Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-700 border-emerald-200">
                                Actif
                              </Badge>
                            )}
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title="Modifier l’article"
                              onClick={() => openEditArticle(article)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              title="Supprimer l’article"
                              onClick={() => handleDeleteArticle(article)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 border-t border-muted/50 pt-3">
                          <div className="flex justify-between items-center mb-3">
                            <p className="text-sm font-medium">Prix forfaitaires par fournisseur</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => openAddPrice(article.id)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Ajouter un tarif
                            </Button>
                          </div>
                          {prices.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Aucun tarif — ajoutez le prix chez chaque fournisseur concerné.
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Fournisseur</TableHead>
                                  <TableHead className="text-right">Prix unitaire (FCFA)</TableHead>
                                  <TableHead>Notes</TableHead>
                                  <TableHead className="w-[90px]" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {stableSort(prices, (a, b) =>
                                  frCollator.compare(
                                    a.fournisseurNom ?? a.fournisseurId,
                                    b.fournisseurNom ?? b.fournisseurId,
                                  ),
                                ).map((p) => {
                                  const nom =
                                    p.fournisseurNom ??
                                    fournisseursFiches.find((f) => f.id === p.fournisseurId)?.nom ??
                                    '—';
                                  return (
                                    <TableRow key={p.id}>
                                      <TableCell className="font-medium">{nom}</TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {p.prixUnitaire.toLocaleString('fr-FR')}
                                      </TableCell>
                                      <TableCell className="text-muted-foreground text-sm">
                                        {p.notes || '—'}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex gap-1 justify-end">
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => openEditPrice(article.id, p)}
                                          >
                                            <Edit className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="text-destructive"
                                            onClick={() =>
                                              handleDeletePrice(p.id, article.libelle, nom)
                                            }
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPriceId ? 'Modifier le tarif fournisseur' : 'Tarif forfaitaire fournisseur'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePriceSubmit} className="space-y-4">
            <div>
              <Label>Fournisseur</Label>
              <ThirdPartyPicker
                className="mt-1"
                options={fournisseursFiches}
                value={priceForm.fournisseurId}
                onValueChange={(id) => setPriceForm((p) => ({ ...p, fournisseurId: id }))}
                placeholder="Choisir un fournisseur…"
              />
            </div>
            <div>
              <Label htmlFor="price-pu">Prix unitaire (FCFA)</Label>
              <NumberInput
                id="price-pu"
                className="mt-1"
                min={0}
                value={priceForm.prixUnitaire}
                onChange={(v) => setPriceForm((p) => ({ ...p, prixUnitaire: v }))}
              />
            </div>
            <div>
              <Label htmlFor="price-notes">Notes (optionnel)</Label>
              <Input
                id="price-notes"
                value={priceForm.notes}
                onChange={(e) => setPriceForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Réf. contrat, validité…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPriceDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enregistrer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
