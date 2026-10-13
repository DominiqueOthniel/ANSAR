import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORTIE_CATEGORIES,
  mergeCaisseCategoriesWithUsed,
  normalizeCaisseCategories,
} from '@/lib/caisse-categories';

describe('normalizeCaisseCategories', () => {
  it('retourne les défauts si entrée vide', () => {
    expect(normalizeCaisseCategories(null)).toEqual([...DEFAULT_SORTIE_CATEGORIES]);
    expect(normalizeCaisseCategories([])).toEqual([...DEFAULT_SORTIE_CATEGORIES]);
  });

  it('dédoublonne sans tenir compte de la casse', () => {
    expect(normalizeCaisseCategories(['Transport', 'transport', '  Péage  '])).toEqual([
      'Transport',
      'Péage',
    ]);
  });
});

describe('mergeCaisseCategoriesWithUsed', () => {
  it('fusionne la liste gérée et les catégories déjà utilisées', () => {
    expect(mergeCaisseCategoriesWithUsed(['Carburant'], ['Carburant', 'Divers', '', null])).toEqual([
      'Carburant',
      'Divers',
    ]);
  });
});
