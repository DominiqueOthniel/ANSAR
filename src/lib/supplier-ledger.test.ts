import { describe, expect, it } from 'vitest';
import {
  buildSupplierLoadingRecapRows,
  summarizeSupplierLoadingRecap,
} from './supplier-ledger';
import type { SupplierLoading, ThirdParty } from '@/contexts/AppContext';

const fournisseurs: ThirdParty[] = [
  {
    id: 'f1',
    type: 'fournisseur',
    nom: 'CIMAF',
  } as ThirdParty,
];

describe('supplier-ledger (récap chargements)', () => {
  it('une ligne = un bon, sans clients ni paiements', () => {
    const loadings: SupplierLoading[] = [
      {
        id: 'l1',
        fournisseurId: 'f1',
        fournisseurNom: 'CIMAF',
        designation: '42.5R',
        quantite: 100,
        unite: 'sacs',
        montantBon: 458600,
        dateChargement: '2026-10-05',
        numeroBon: 'BN-1',
        statut: 'en_attente_affectation',
        modeEntree: 'bon_simple',
        assignments: [{ id: 'a1', clientOrderId: 'o1', clientNom: 'KIRIKOU' }],
      } as SupplierLoading,
    ];
    const rows = buildSupplierLoadingRecapRows({
      loadings,
      articles: [],
      trucks: [],
      fournisseurs,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].fournisseurNom).toBe('CIMAF');
    expect(rows[0].montant).toBe(458600);
    expect(rows[0].numeroBon).toBe('BN-1');
    expect(JSON.stringify(rows)).not.toContain('KIRIKOU');
    const sum = summarizeSupplierLoadingRecap(rows);
    expect(sum.n).toBe(1);
    expect(sum.montant).toBe(458600);
  });

  it('exclut les bons annulés par défaut', () => {
    const loadings: SupplierLoading[] = [
      {
        id: 'l1',
        fournisseurId: 'f1',
        designation: '32.5R',
        quantite: 50,
        montantBon: 1000,
        dateChargement: '2026-10-01',
        statut: 'annule',
      } as SupplierLoading,
    ];
    expect(
      buildSupplierLoadingRecapRows({
        loadings,
        articles: [],
        trucks: [],
        fournisseurs,
      }),
    ).toHaveLength(0);
  });
});
