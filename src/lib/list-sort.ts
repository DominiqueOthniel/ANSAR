/** Collateur français pour libellés (A–Z cohérent avec l’UI). */
export const frCollator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

export function parseDateMs(s: string | undefined | null): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Tri stable : en cas d’égalité sur le critère principal, l’ordre d’origine est conservé.
 */
export function stableSort<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((x, y) => {
      const c = compare(x.item, y.item);
      return c !== 0 ? c : x.index - y.index;
    })
    .map((x) => x.item);
}

export function compareAsc(a: number, b: number): number {
  return a - b;
}

export function compareDesc(a: number, b: number): number {
  return b - a;
}

/**
 * Formate une date ISO (YYYY-MM-DD) en format français (JJ/MM/AAAA)
 * sans problème de timezone (évite le décalage d'un jour).
 * @param dateString Date au format ISO (YYYY-MM-DD)
 * @returns Date formatée en français ou chaîne vide si invalide
 */
export function formatDateLocal(dateString: string | undefined | null): string {
  if (!dateString?.trim()) return '';
  
  const parts = dateString.split('T')[0].split('-');
  if (parts.length !== 3) return dateString;
  
  const [year, month, day] = parts;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  
  if (isNaN(date.getTime())) return dateString;
  
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}
