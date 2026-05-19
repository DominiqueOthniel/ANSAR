import type { Article, ArticleSupplierPrice } from '@/contexts/AppContext';

/** Prix unitaire forfaitaire article × fournisseur. */
export function getArticleSupplierUnitPrice(
  article: Article | undefined,
  fournisseurId: string,
): number | undefined {
  if (!article?.supplierPrices?.length || !fournisseurId) return undefined;
  const row = article.supplierPrices.find((p) => p.fournisseurId === fournisseurId);
  if (!row || row.prixUnitaire <= 0) return undefined;
  return row.prixUnitaire;
}

/** Articles actifs ayant un tarif chez ce fournisseur. */
export function listArticlesForSupplier(
  articles: Article[],
  fournisseurId: string,
): Article[] {
  if (!fournisseurId) return [];
  return articles.filter(
    (a) =>
      a.actif !== false &&
      (a.supplierPrices ?? []).some(
        (p) => p.fournisseurId === fournisseurId && p.prixUnitaire > 0,
      ),
  );
}

export function formatArticleSupplierPriceLabel(
  article: Article,
  fournisseurId: string,
): string {
  const pu = getArticleSupplierUnitPrice(article, fournisseurId);
  const base = article.libelle;
  if (pu == null) return base;
  return `${base} — ${pu.toLocaleString('fr-FR')} FCFA / ${article.unite || 'unité'}`;
}

export function findSupplierPriceRow(
  article: Article,
  fournisseurId: string,
): ArticleSupplierPrice | undefined {
  return article.supplierPrices?.find((p) => p.fournisseurId === fournisseurId);
}

/** Prix unitaire de vente pour une commande client (prix vente catalogue, sinon max tarif fournisseur). */
export function getArticleSaleUnitPrice(article: Article | undefined): number | undefined {
  if (!article) return undefined;
  if (article.prixVente != null && article.prixVente > 0) return article.prixVente;
  const supplierPrices = (article.supplierPrices ?? [])
    .map((p) => p.prixUnitaire)
    .filter((n) => n > 0);
  if (supplierPrices.length === 0) return undefined;
  return Math.max(...supplierPrices);
}

export function computeLineAmount(
  quantite?: number,
  prixUnitaire?: number,
): number | undefined {
  if (
    quantite != null &&
    prixUnitaire != null &&
    quantite > 0 &&
    prixUnitaire > 0
  ) {
    return Math.round(quantite * prixUnitaire);
  }
  return undefined;
}

/** Articles actifs avec un prix de vente utilisable en commande. */
export function listArticlesForClientOrders(articles: Article[]): Article[] {
  return articles.filter((a) => a.actif !== false && getArticleSaleUnitPrice(a) != null);
}

export function formatArticleSalePriceLabel(article: Article): string {
  const pu = getArticleSaleUnitPrice(article);
  const base = article.libelle;
  if (pu == null) return base;
  return `${base} — ${pu.toLocaleString('fr-FR')} FCFA / ${article.unite || 'unité'}`;
}
