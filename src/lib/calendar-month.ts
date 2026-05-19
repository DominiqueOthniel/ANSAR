/** Mois calendaire (month = 0..11, indépendant du fuseau horaire). */
export type CalendarMonth = { year: number; month: number };

/** Extrait année/mois d’une date ISO `YYYY-MM-DD` (ou datetime) sans décalage UTC. */
export function parseCalendarMonth(iso: string | undefined | null): CalendarMonth | null {
  if (!iso?.trim()) return null;
  const day = iso.includes('T') ? iso.split('T')[0]! : iso.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (!Number.isFinite(year) || month < 0 || month > 11) return null;
  return { year, month };
}

export function monthKey({ year, month }: CalendarMonth): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function formatMonthLabelFr(
  { year, month }: CalendarMonth,
  opts?: { forceYear?: boolean },
): string {
  const d = new Date(year, month, 1);
  const short = d.toLocaleDateString('fr-FR', { month: 'short' });
  const nowY = new Date().getFullYear();
  if (opts?.forceYear || year !== nowY) {
    return `${short} ${String(year).slice(-2)}`;
  }
  return short;
}

/** Mois affichés sur le dashboard : N derniers mois + tout mois présent dans les données. */
export function buildDashboardMonths(
  dateStrings: (string | undefined | null)[],
  options?: { trailingMonths?: number; maxPoints?: number },
): CalendarMonth[] {
  const trailingMonths = options?.trailingMonths ?? 12;
  const maxPoints = options?.maxPoints ?? 18;
  const keys = new Map<string, CalendarMonth>();
  const now = new Date();

  for (let i = trailingMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const cm: CalendarMonth = { year: d.getFullYear(), month: d.getMonth() };
    keys.set(monthKey(cm), cm);
  }

  for (const iso of dateStrings) {
    const p = parseCalendarMonth(iso);
    if (p) keys.set(monthKey(p), p);
  }

  return [...keys.values()]
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .slice(-maxPoints);
}

export function isSameCalendarMonth(iso: string | undefined | null, target: CalendarMonth): boolean {
  const p = parseCalendarMonth(iso);
  return p !== null && p.year === target.year && p.month === target.month;
}
