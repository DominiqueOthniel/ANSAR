import { useEffect } from 'react';
import { BRAND_NAME } from '@/lib/brand';

/** Titre d’onglet strict : évite les anciens préfixes de projet ou caches externes. */
export function DocumentTitle() {
  useEffect(() => {
    const setBrandTitle = () => {
      if (document.title !== BRAND_NAME) document.title = BRAND_NAME;
    };

    setBrandTitle();
    const intervalId = window.setInterval(setBrandTitle, 500);
    return () => window.clearInterval(intervalId);
  }, []);
  return null;
}
