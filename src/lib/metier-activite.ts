/**
 * Formulations métier : intermédiation logistique / commerciale
 * entre gros donneurs d’ordre et structures de terrain (sans marques).
 */

export const ACTIVITE_ROLE_COURT =
  'Intermédiaire logistique : vous reliez les gros donneurs d’ordre (industriels, importateurs…) aux structures de terrain (détaillants, chantiers, PME).';

export const PAGE_DASHBOARD_DESCRIPTION = `${ACTIVITE_ROLE_COURT} Synthèse encaissements et marge à partir des factures (paiements trajets / expéditions) et des dépenses — hors dons saisis uniquement en Caisse.`;

export const PAGE_TRAJETS_DESCRIPTION = `${ACTIVITE_ROLE_COURT} Planifiez les missions : itinéraire, arrêts, recette ; plusieurs clients peuvent être facturés sur un même trajet.`;

export const PAGE_FACTURES_DESCRIPTION =
  'Facturation des prestations ou marges vendues à vos clients (trajets, expéditions, frais). Plusieurs factures possibles sur une même mission lorsque plusieurs structures sont concernées.';

export const PAGE_CLIENTS_DESCRIPTION = `${ACTIVITE_ROLE_COURT} Fiches partenaires : coordonnées, encours, lien avec trajets, factures et envois colis.`;

export const PAGE_TIERS_DESCRIPTION = `${ACTIVITE_ROLE_COURT} Propriétaires de camions, clients, fournisseurs, et personnel siège (employés) pour lier les salaires hors chauffeurs.`;

export const PAGE_EXPEDITIONS_DESCRIPTION = `${ACTIVITE_ROLE_COURT} Expéditions groupées : plusieurs lots / clients sur un même convoi pour consolider des commandes plus petites.`;

export const PAGE_TRUCKS_DESCRIPTION =
  'Tracteurs et remorques : affectation aux missions et suivi de la flotte pour compte de tiers.';

export const PAGE_DEPENSES_DESCRIPTION =
  "Frais d'exploitation des missions et du siège : carburant, péages, sous-traitance, charges courantes…";

export const PAGE_CHAUFFEURS_DESCRIPTION =
  'Chauffeurs, documents et mouvements financiers liés aux missions de transport.';

export const PAGE_CAISSE_DESCRIPTION =
  'Entrées et sorties de caisse. Pour une entrée, cochez « Financement » si le montant ne doit pas compter comme encaissement d’activité (le tableau de bord reste basé sur les factures et dépenses).';

export const PAGE_CREDITS_DESCRIPTION = `${ACTIVITE_ROLE_COURT} Emprunts réels et commandes clients sans paiement immédiat (créances) — isolés de la caisse et du tableau de bord.`;
