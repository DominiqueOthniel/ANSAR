import { describe, expect, it } from 'vitest';
import type { SupplierLoading } from '@/contexts/AppContext';
import {
  buildLoadingReceiptPdfInnerHtml,
  loadingReceiptPrintTitle,
} from './loading-receipt-pdf-html';

describe('loading-receipt-pdf-html', () => {
  const base: SupplierLoading = {
    id: 'bon-uuid-1234',
    fournisseurId: 'f1',
    fournisseurNom: 'CIMAF',
    numeroBon: 'BN-42',
    designation: 'Ciment CPJ 45',
    quantite: 540,
    unite: 'sacs',
    montantBon: 1_250_000,
    dateChargement: '2026-10-01',
    statut: 'affecte',
    modeEntree: 'camion',
    camionId: 't1',
    assignments: [
      {
        id: 'a1',
        loadingId: 'bon-uuid-1234',
        clientOrderId: 'o1',
        clientId: 'c1',
        clientNom: 'Client Test',
        orderReference: 'CMD-1',
        orderDesignation: 'Livraison Douala',
        quantiteAffectee: 540,
        orderStatus: 'en_cours',
      },
    ],
  };

  it('buildLoadingReceiptPdfInnerHtml embeds key receipt fields', () => {
    const html = buildLoadingReceiptPdfInnerHtml({
      loading: base,
      truckLabel: 'SIA-12 · LT-001-AA',
      resolveClientName: () => 'Client Test',
    });
    expect(html).toContain('Reçu — Bon de chargement');
    expect(html).toContain('BN-42');
    expect(html).toContain('CIMAF');
    expect(html).toContain('Ciment CPJ 45');
    expect(html).toContain('1');
    expect(html).toContain('250');
    expect(html).toContain('000');
    expect(html).toContain('SIA-12');
    expect(html).toContain('Client Test');
    expect(html).toContain('CMD-1');
  });

  it('loadingReceiptPrintTitle uses numeroBon when present', () => {
    expect(loadingReceiptPrintTitle(base)).toBe('Reçu bon BN-42');
  });

  it('escapes HTML in designation', () => {
    const html = buildLoadingReceiptPdfInnerHtml({
      loading: { ...base, designation: 'A <b>B</b> & C' },
    });
    expect(html).toContain('A &lt;b&gt;B&lt;/b&gt; &amp; C');
    expect(html).not.toContain('A <b>B</b>');
  });
});
