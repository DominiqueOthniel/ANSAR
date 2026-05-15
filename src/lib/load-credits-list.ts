import { creditsApi } from '@/lib/api';
import { CREDITS_DATA_STORAGE_KEY } from '@/lib/credits-constants';
import { normalizeCreditLike, type CreditLike } from '@/lib/client-credit-plafond';

export async function loadCreditsList(): Promise<CreditLike[]> {
  if (import.meta.env.VITE_API_URL?.trim()) {
    try {
      const data = await creditsApi.getAll();
      return Array.isArray(data) ? data.map((x) => normalizeCreditLike(x as Record<string, unknown>)) : [];
    } catch {
      return [];
    }
  }
  try {
    const raw = localStorage.getItem(CREDITS_DATA_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) =>
      normalizeCreditLike({
        ...r,
        montantTotal: r.montantTotal,
        montantRembourse: r.montantRembourse ?? 0,
        tauxInteret: r.tauxInteret,
      }),
    );
  } catch {
    return [];
  }
}
