import { describe, expect, it } from 'vitest';
import {
  coerceTjkClientShares,
  filterValidTjkShares,
  formatTjkSharesLabel,
  newTjkClientShare,
  sumTjkShareMontant,
  sumTjkShareQuantite,
  validateTjkClientShares,
} from '@/lib/tjk-client-shares';

describe('tjk-client-shares', () => {
  it('somme les quantités et montants des parts', () => {
    const shares = [
      newTjkClientShare({ clientNom: 'A', quantite: 10, montant: 1000 }),
      newTjkClientShare({ clientNom: 'B', quantite: 5, montant: 500 }),
      newTjkClientShare({ clientNom: 'C', quantite: 0, montant: 0 }),
    ];
    expect(sumTjkShareQuantite(shares)).toBe(15);
    expect(sumTjkShareMontant(shares)).toBe(1500);
  });

  it('valide une ventilation multi-clients', () => {
    const ok = validateTjkClientShares(
      [
        newTjkClientShare({ clientNom: 'A', quantite: 4, montant: 400 }),
        newTjkClientShare({ clientNom: 'B', quantite: 6, montant: 600 }),
      ],
      { maxQuantite: 10 },
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.quantite).toBe(10);
      expect(ok.montantSum).toBe(1000);
      expect(ok.shares).toHaveLength(2);
    }
  });

  it('refuse un dépassement du reste bon', () => {
    const bad = validateTjkClientShares(
      [newTjkClientShare({ clientNom: 'A', quantite: 12 })],
      { maxQuantite: 10 },
    );
    expect(bad.ok).toBe(false);
    if (bad.ok === false) expect(bad.message).toMatch(/trop élevée/i);
  });

  it('refuse une part sans quantité', () => {
    const bad = validateTjkClientShares([
      newTjkClientShare({ clientNom: 'A', quantite: undefined }),
    ]);
    expect(bad.ok).toBe(false);
  });

  it('reconstruit une part legacy mono-client', () => {
    const shares = coerceTjkClientShares({
      clientId: 'c1',
      clientNom: 'Alpha',
      quantite: 20,
      prixTrans: 2000,
    });
    expect(shares).toHaveLength(1);
    expect(shares[0].clientId).toBe('c1');
    expect(shares[0].clientNom).toBe('Alpha');
    expect(shares[0].quantite).toBe(20);
    expect(shares[0].montant).toBe(2000);
  });

  it('conserve les parts persistées et le libellé', () => {
    const a = newTjkClientShare({ clientNom: 'Un', quantite: 1 });
    const b = newTjkClientShare({ clientNom: 'Deux', quantite: 2 });
    const shares = coerceTjkClientShares({ clientShares: [a, b] });
    expect(shares.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(formatTjkSharesLabel(shares)).toBe('Un, Deux');
    expect(filterValidTjkShares(shares)).toHaveLength(2);
  });
});
