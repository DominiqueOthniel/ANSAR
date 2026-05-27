import { useEffect } from 'react';

/** Titre d’onglet strict : évite les anciens préfixes de projet ou caches externes. */
const BRAND = 'ANSAR';

export function DocumentTitle() {
  useEffect(() => {
    const setBrandTitle = () => {
      if (document.title !== BRAND) document.title = BRAND;
    };

    setBrandTitle();
    const intervalId = window.setInterval(setBrandTitle, 500);
    return () => window.clearInterval(intervalId);
  }, []);
  return null;
}
