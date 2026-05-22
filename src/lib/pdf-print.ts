/**
 * Styles et ouverture d’impression PDF (factures + exports listes).
 * Tous les PDF partagent la même base A4 et les règles d’impression.
 */

import { TRUCK_LOGO_SVG_MARK } from '@/lib/invoice-branding';

export type PdfPrintVariant = 'invoice' | 'report' | 'report-landscape';

export function escapePdfHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Styles communs @page + typo + tableaux. */
export function getPdfBaseStyles(variant: PdfPrintVariant = 'report'): string {
  const pageSize = variant === 'report-landscape' ? 'A4 landscape' : 'A4 portrait';
  const baseFont = variant === 'invoice' ? '10.5pt' : '10pt';
  const tableFont = variant === 'invoice' ? '9.5pt' : '9pt';

  return `
    @page {
      size: ${pageSize};
      margin: 10mm 12mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .pdf-print-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 12px;
      margin: 0 0 12px 0;
      background: rgba(248, 250, 252, 0.96);
      border-bottom: 1px solid #e2e8f0;
      backdrop-filter: blur(8px);
    }
    .pdf-print-button {
      border: 0;
      border-radius: 8px;
      background: #2563eb;
      color: #fff;
      font: 700 13px "Segoe UI", system-ui, -apple-system, sans-serif;
      padding: 9px 14px;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.2);
    }
    .pdf-print-button:hover { background: #1d4ed8; }
    .pdf-root {
      width: 100%;
      max-width: ${variant === 'report-landscape' ? '277mm' : '186mm'};
      margin: 0 auto;
      font-size: ${baseFont};
      line-height: 1.35;
    }
    .pdf-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 14px;
      padding: 12px 14px;
      background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }
    .pdf-brand-logo {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 10px;
      background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 3px 10px rgba(37, 99, 235, 0.28);
    }
    .pdf-brand-logo svg { width: 28px; height: 28px; }
    .pdf-brand-name {
      font-size: 15pt;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0f172a;
      line-height: 1.15;
    }
    .pdf-brand-meta {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 3px;
    }
    .pdf-brand-doc {
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #2563eb;
      font-weight: 700;
      margin-top: 6px;
    }
    .pdf-doc-header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .pdf-doc-title {
      font-size: ${variant === 'invoice' ? '13pt' : '14pt'};
      font-weight: 800;
      color: #1e40af;
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }
    .pdf-doc-date {
      font-size: 8.5pt;
      color: #64748b;
      margin: 0;
    }
    .pdf-filters {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 12px;
      font-size: 8.5pt;
      color: #92400e;
    }
    .pdf-table-wrap {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      margin-bottom: 12px;
    }
    table.pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${tableFont};
    }
    table.pdf-table thead th {
      padding: 7px 8px;
      text-align: left;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #fff;
      background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
      border: none;
    }
    table.pdf-table tbody td {
      padding: 6px 8px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
      color: #334155;
    }
    table.pdf-table tbody tr:nth-child(even) td { background: #f8fafc; }
    table.pdf-table tbody tr:last-child td { border-bottom: none; }
    .pdf-section-title {
      font-size: 9.5pt;
      font-weight: 700;
      color: #1e40af;
      margin: 14px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #cbd5e1;
    }
    .pdf-totals {
      margin-top: 12px;
      padding: 10px 12px;
      border: 2px solid #2563eb;
      border-radius: 8px;
      background: #f8fafc;
    }
    .pdf-totals-title {
      font-size: 9pt;
      font-weight: 700;
      color: #1e40af;
      margin: 0 0 8px 0;
    }
    .pdf-totals-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pdf-total-chip {
      flex: 1 1 120px;
      padding: 8px 10px;
      border-radius: 6px;
      text-align: center;
      border: 1px solid #cbd5e1;
      background: #fff;
    }
    .pdf-total-chip.positive { border-color: #86efac; background: #f0fdf4; }
    .pdf-total-chip.negative { border-color: #fca5a5; background: #fef2f2; }
    .pdf-total-label {
      font-size: 7.5pt;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .pdf-total-value {
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
    }
    .pdf-footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 7.5pt;
      color: #94a3b8;
      text-align: center;
    }
    .pdf-stats {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }
    .pdf-stat {
      padding: 8px 14px;
      border-radius: 6px;
      border: 1px solid #93c5fd;
      background: #eff6ff;
      text-align: center;
    }
    .pdf-stat-value { font-size: 14pt; font-weight: 800; color: #1e40af; }
    .pdf-stat-label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; }
    .detail-block { margin-top: 10px; page-break-inside: avoid; }
    .detail-block-title {
      font-size: 8pt;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      margin: 0 0 6px 0;
    }
    .client-detail-card {
      margin-bottom: 12px;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fafafa;
      page-break-inside: avoid;
    }
    .client-detail-heading {
      font-size: 9.5pt;
      font-weight: 700;
      margin: 0 0 8px 0;
    }
    .details-section { margin-top: 16px; }
    .details-section-title {
      font-size: 10pt;
      font-weight: 700;
      color: #1e40af;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 4px;
      margin-bottom: 10px;
    }
    @media print {
      .pdf-print-toolbar { display: none !important; }
      html, body { height: auto; }
      .pdf-root { max-width: 100%; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      .pdf-no-break { page-break-inside: avoid; }
    }
    ${variant === 'invoice' ? `
    .pdf-invoice-doc {
      page-break-inside: avoid;
      max-height: 277mm;
      overflow: hidden;
    }
    @media print {
      .pdf-invoice-doc {
        transform-origin: top center;
      }
    }
    ` : ''}
  `;
}

export function buildPdfBrandHtml(opts: {
  companyName: string;
  tagline?: string;
  documentLabel?: string;
}): string {
  return `
    <div class="pdf-brand">
      <div class="pdf-brand-logo">${TRUCK_LOGO_SVG_MARK}</div>
      <div>
        <div class="pdf-brand-name">${escapePdfHtml(opts.companyName)}</div>
        ${opts.tagline ? `<div class="pdf-brand-meta">${escapePdfHtml(opts.tagline)}</div>` : ''}
        ${opts.documentLabel ? `<div class="pdf-brand-doc">${escapePdfHtml(opts.documentLabel)}</div>` : ''}
      </div>
    </div>`;
}

/** Ouvre une fenêtre d’impression / PDF avec styles unifiés. */
export function openPdfPrintWindow(opts: {
  title: string;
  bodyHtml: string;
  variant?: PdfPrintVariant;
  accentColor?: string;
}): void {
  const variant = opts.variant ?? 'report';
  const accent = opts.accentColor ?? '#2563eb';
  const styles = getPdfBaseStyles(variant).replace(/#2563eb/g, accent).replace(/#1e40af/g, accent);

  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>${escapePdfHtml(opts.title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="pdf-print-toolbar">
    <button class="pdf-print-button" type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="pdf-root ${variant === 'invoice' ? 'pdf-invoice-doc' : ''}">
    ${opts.bodyHtml}
  </div>
</body>
</html>`);

  win.document.close();
}

export function formatPdfDateTime(d = new Date()): string {
  return d.toLocaleString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPdfDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
