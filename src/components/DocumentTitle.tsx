import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Titre d’onglet court : évite les concaténations avec le nom du projet (ex. Lovable / hébergeur). */
const BRAND = 'ANSAR';

function titleForPath(pathname: string): string {
  const map: Record<string, string> = {
    '/': 'Tableau de bord',
    '/login': 'Connexion',
    '/camions': 'Camions',
    '/depenses': 'Dépenses',
    '/factures': 'Factures',
    '/chauffeurs': 'Chauffeurs',
    '/clients': 'Clients',
    '/tiers': 'Tiers',
    '/articles': 'Articles',
    '/chargements': 'Chargements',
    '/fournisseurs': 'Fournisseurs',
    '/caisse': 'Caisse',
    '/historique': 'Mouvements',
    '/utilisateurs': 'Utilisateurs',
  };
  const page = map[pathname];
  if (page) return `${page} · ${BRAND}`;
  return BRAND;
}

export function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
  return null;
}
