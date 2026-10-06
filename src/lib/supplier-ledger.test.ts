import { describe, expect, it } from 'vitest';
import { buildSupplierLedgerRows, summarizeSupplierLedger } from './supplier-ledger';
import type { SupplierLoading, Expense, ThirdParty } from '@/contexts/AppContext';

const fournisseurs: ThirdParty[] = [
  {
    id: 'f1',
    type: 'fournisseur',
    nom: 'CIMAF',
  } as ThirdParty,
];

describe('supplier-ledger', () => {
  it('calcule solde = débit − crédit et n’utilise jamais le client', () => {
    const loadings: SupplierLoading[] = [
      {
        id: 'l1',
        fournisseurId: 'f1',
        fournisseurNom: 'CIMAF',
        designation: '42.5R',
        quantite: 100,
        montantBon: 458600,
        dateChargement: '2026-10-05',
        statut: 'en_attente_affectation',
        // Affectations clients présentes mais ignorées par le suivi fournisseurs.
        assignments: [{ id: 'a1', clientOrderId: 'o1', clientNom: 'KIRIKOU' }],
      } as SupplierLoading,
    ];
    const expenses: Expense[] = [
      {
        id: 'e1',
        fournisseurId: 'f1',
        categorie: 'Paiement',
        montant: 200000,
        date: '2026-10-05',
        description: 'Acompte',
      },
    ];
    const rows = buildSupplierLedgerRows({
      loadings,
      expenses,
      invoices: [],
      articles: [],
      trucks: [],
      fournisseurs,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].debit).toBe(458600);
    expect(rows[0].fournisseurNom).toBe('CIMAF');
    expect(JSON.stringify(rows)).not.toContain('KIRIKOU');
    expect(rows[1].credit).toBe(200000);
    expect(rows[1].solde).toBe(258600);
    const sum = summarizeSupplierLedger(rows);
    expect(sum.debit).toBe(458600);
    expect(sum.credit).toBe(200000);
    expect(sum.solde).toBe(258600);
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
      buildSupplierLedgerRows({
        loadings,
        expenses: [],
        invoices: [],
        articles: [],
        trucks: [],
        fournisseurs,
      }),
    ).toHaveLength(0);
  });
});
