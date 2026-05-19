import type { Truck } from '@/contexts/AppContext';

/** Camion dont le chauffeur attitré correspond à `driverId` (premier trouvé). */
export function findTruckForDriver(trucks: Truck[], driverId: string): Truck | undefined {
  if (!driverId) return undefined;
  return trucks.find((t) => t.chauffeurId === driverId);
}

/**
 * Met à jour chauffeur / camion en gardant l’autre champ si aucun lien fiche camion.
 * Permet toujours de changer manuellement l’un ou l’autre ensuite.
 */
export function linkDriverTruckSelection(
  trucks: Truck[],
  current: { chauffeurId: string; tracteurId: string },
  field: 'chauffeur' | 'tracteur',
  value: string,
): { chauffeurId: string; tracteurId: string } {
  if (field === 'chauffeur') {
    if (!value) return { ...current, chauffeurId: '' };
    const truck = findTruckForDriver(trucks, value);
    return {
      chauffeurId: value,
      tracteurId: truck?.id ?? current.tracteurId,
    };
  }
  if (!value) return { ...current, tracteurId: '' };
  const truck = trucks.find((t) => t.id === value);
  return {
    tracteurId: value,
    chauffeurId: truck?.chauffeurId ?? current.chauffeurId,
  };
}
