/** Collateur français pour libellés (A–Z cohérent avec l’UI). */
export const frCollator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/**
 * Parse une date en millisecondes sans biais UTC sur les chaînes date seule (YYYY-MM-DD).
 * `Date.parse('2024-01-15')` est interprété en UTC et décale l’affichage / le tri selon le fuseau.
 */
export function parseDateMs(s: string | undefined | null): number {
  if (!s) return 0;
  const dateOnly = String(s).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [y, m, d] = dateOnly.split('-').map(Number);
    const local = new Date(y, m - 1, d);
    return Number.isNaN(local.getTime()) ? 0 : local.getTime();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

/** Date du jour au format YYYY-MM-DD en heure locale (évite le décalage de toISOString). */
export function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
