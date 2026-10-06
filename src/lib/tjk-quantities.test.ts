import { describe, expect, it } from 'vitest';
import { tjkMontantFromPrixTonnage, tjkQuantiteToQtesTonnage } from './tjk-quantities';

describe('tjkQuantiteToQtesTonnage', () => {
  it('aligne qtes sur la quantité et calcule le tonnage (sacs 50 kg)', () => {
    expect(tjkQuantiteToQtesTonnage(540, 50)).toEqual({ qtes: 540, tonnage: 27 });
  });

  it('retourne undefined si quantité absente', () => {
    expect(tjkQuantiteToQtesTonnage(undefined)).toEqual({
      qtes: undefined,
      tonnage: undefined,
    });
  });
});

describe('tjkMontantFromPrixTonnage', () => {
  it('calcule le montant final', () => {
    expect(tjkMontantFromPrixTonnage(27, 29000)).toBe(783000);
  });
});
