import { describe, expect, it } from 'vitest';
import { formatDateLocal, localTodayIso, parseDateMs } from '@/lib/list-sort';

describe('date helpers (timezone)', () => {
  it('parseDateMs traite YYYY-MM-DD en local (pas UTC)', () => {
    const ms = parseDateMs('2024-01-15');
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('formatDateLocal n’avance ni ne recule d’un jour', () => {
    expect(formatDateLocal('2024-01-15')).toBe('15/01/2024');
    expect(formatDateLocal('2024-01-15T00:00:00.000Z')).toBe('15/01/2024');
  });

  it('localTodayIso correspond au calendrier local', () => {
    const today = localTodayIso();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    expect(today).toBe(expected);
  });
});
