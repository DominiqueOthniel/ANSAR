import * as XLSX from 'xlsx';
import { TRUCK_LOGO_SVG_MARK } from '@/lib/invoice-branding';

export interface ExportColumnDef<T> {
  header: string;
  value: (row: T, index: number) => string | number | null | undefined;
  cellStyle?: (row: T, index: number) => 'positive' | 'negative' | 'neutral' | undefined;
}

interface ExportOptions<T> {
  title: string;
  fileName: string;
  sheetName?: string;
  filtersDescription?: string;
  columns: ExportColumnDef<T>[];
  rows: T[];
}

/** Sous-tableau affiché sous la synthèse (par client, par section, etc.). */
export interface ExportDetailBlock {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ExportWithDetailsOptions<T> extends ExportOptions<T> {
  buildDetailBlocks: (row: T, index: number) => ExportDetailBlock[];
  getDetailHeading?: (row: T, index: number) => string;
  detailsSectionTitle?: string;
}

export function exportToExcel<T>(options: ExportOptions<T>) {
  const { title, fileName, sheetName = 'Données', filtersDescription, columns, rows } = options;

  const data: (string | number)[][] = [];

  // Première ligne : titre
  data.push([title]);

  // Deuxième ligne : filtres, si présents
  if (filtersDescription) {
    data.push([filtersDescription]);
  }

  // Ligne vide de séparation
  data.push([]);

  // En‑têtes
  data.push(columns.map((c) => c.header));

  // Lignes de données
  rows.forEach((row, index) => {
    data.push(
      columns.map((c) => {
        const value = c.value(row, index);
        if (value == null) return '';
        return typeof value === 'number' || typeof value === 'string'
          ? value
          : String(value);
      }),
    );
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

function appendDetailBlockRows(
  data: (string | number)[][],
  block: ExportDetailBlock,
): void {
  data.push([block.title]);
  data.push(block.columns);
  block.rows.forEach((row) => {
    data.push(row.map((c) => (c == null ? '' : c)));
  });
  data.push([]);
}

/** Export Excel : tableau de synthèse puis, pour chaque ligne, blocs de détail structurés. */
export function exportToExcelWithDetails<T>(options: ExportWithDetailsOptions<T>) {
  const {
    title,
    fileName,
    sheetName = 'Données',
    filtersDescription,
    columns,
    rows,
    buildDetailBlocks,
    getDetailHeading,
    detailsSectionTitle = 'DÉTAIL PAR CLIENT',
  } = options;

  const data: (string | number)[][] = [];
  data.push([title]);
  if (filtersDescription) data.push([filtersDescription]);
  data.push([]);
  data.push(columns.map((c) => c.header));
  rows.forEach((row, index) => {
    data.push(
      columns.map((c) => {
        const value = c.value(row, index);
        if (value == null) return '';
        return typeof value === 'number' || typeof value === 'string' ? value : String(value);
      }),
    );
  });

  data.push([]);
  data.push([detailsSectionTitle]);
  data.push([]);

  rows.forEach((row, index) => {
    const heading = getDetailHeading?.(row, index) ?? `Ligne ${index + 1}`;
    data.push([`▸ ${heading}`]);
    data.push([]);
    buildDetailBlocks(row, index).forEach((block) => appendDetailBlockRows(data, block));
    data.push([]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export interface ExportDocumentOptions {
  title: string;
  fileName: string;
  filtersDescription?: string;
  sheetName?: string;
  /** Tableau principal (synthèse). */
  summary: ExportDetailBlock;
  /** Sections détaillées sous la synthèse. */
  sections?: ExportDetailBlock[];
}

/** Export Excel multi-sections : synthèse puis blocs détaillés. */
export function exportDocumentToExcel(options: ExportDocumentOptions): void {
  const { title, fileName, sheetName = 'Données', filtersDescription, summary, sections = [] } =
    options;
  const data: (string | number)[][] = [];
  data.push([title]);
  if (filtersDescription) data.push([filtersDescription]);
  data.push([]);
  appendDetailBlockRows(data, summary);
  for (const block of sections) {
    appendDetailBlockRows(data, block);
  }
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

export interface PDFDocumentOptions extends ExportDocumentOptions {
  headerColor?: string;
  headerTextColor?: string;
  accentColor?: string;
  totals?: ExportTotal[];
}

/** Export PDF multi-sections (fenêtre d’impression). */
export function exportDocumentToPDF(options: PDFDocumentOptions): void {
  const accentColor = options.accentColor ?? '#1e40af';
  const headerColor = options.headerColor ?? accentColor;
  const summaryRows = options.summary.rows
    .map((row, ri) => {
      const bg = ri % 2 === 0 ? '#ffffff' : '#f9fafb';
      const cells = row
        .map((c) => `<td>${escapeHtml(c == null ? '' : String(c))}</td>`)
        .join('');
      return `<tr style="background-color:${bg};">${cells}</tr>`;
    })
    .join('');
  const summaryHeaders = options.summary.columns
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join('');
  const detailHtml = (options.sections ?? [])
    .map((block) => buildPdfDetailBlockHtml(block, accentColor))
    .join('');
  const filtersBlock = options.filtersDescription
    ? `<div class="filters-box">${escapeHtml(options.filtersDescription)}</div>`
    : '';
  const totals = options.totals ?? [];
  const totalsHtml =
    totals.length > 0
      ? `<div class="totals-section"><h3 class="totals-title">Récapitulatif</h3><div class="totals-grid">${totals
          .map(
            (t) =>
              `<div class="total-item ${t.style ?? 'neutral'}"><div class="total-label">${t.icon ?? ''} ${escapeHtml(t.label)}</div><div class="total-value">${escapeHtml(String(t.value))}</div></div>`,
          )
          .join('')}</div></div>`
      : '';

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  const currentDate = new Date().toLocaleString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  printWindow.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${escapeHtml(options.title)}</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#111827;margin:0}
h1{font-size:22px;color:${accentColor};margin:0 0 8px}
.date{font-size:12px;color:#6b7280;margin-bottom:20px}
.filters-box{background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px}
table{width:100%;border-collapse:collapse;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
thead th{padding:10px;text-align:left;font-size:11px;background:${headerColor};color:${options.headerTextColor ?? '#fff'}}
tbody td{padding:8px;font-size:12px;border-bottom:1px solid #e5e7eb}
.detail-block{margin-top:16px}
.detail-block-title{font-size:12px;font-weight:600;color:#4b5563;margin:0 0 8px;text-transform:uppercase}
.totals-section{margin-top:24px;padding:16px;border:2px solid ${accentColor};border-radius:12px}
.totals-grid{display:flex;flex-wrap:wrap;gap:12px}
.total-item{padding:12px 20px;border-radius:8px;text-align:center;min-width:140px}
.total-item.neutral{background:#f3f4f6;border:1px solid #9ca3af}
.total-item.positive{background:#dcfce7;border:1px solid #22c55e}
.total-label{font-size:11px;color:#6b7280}
.total-value{font-size:18px;font-weight:700}
</style></head><body>
<h1>${escapeHtml(options.title)}</h1>
<p class="date">Document généré le ${currentDate}</p>
${filtersBlock}
<h2 style="font-size:14px;color:${accentColor}">${escapeHtml(options.summary.title)}</h2>
<table><thead><tr>${summaryHeaders}</tr></thead><tbody>${summaryRows}</tbody></table>
${detailHtml}
${totalsHtml}
<p style="margin-top:24px;font-size:11px;color:#9ca3af;text-align:center">TruckTrack · ${currentDate}</p>
</body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}

// Interface pour les totaux à afficher dans l'export
export interface ExportTotal {
  label: string;
  value: string | number;
  style?: 'positive' | 'negative' | 'neutral';
  icon?: string;
}

/** En-tête entreprise (logo + nom) pour les exports PDF */
export interface PDFBranding {
  companyName: string;
  tagline?: string;
  /** Sous-titre du document (ex. type d’export) */
  documentLabel?: string;
}

export interface PDFExportOptions<T> extends ExportOptions<T> {
  headerColor?: string;
  headerTextColor?: string;
  evenRowColor?: string;
  oddRowColor?: string;
  accentColor?: string;
  totals?: ExportTotal[];
  branding?: PDFBranding;
  hideDefaultStatBox?: boolean;
  buildDetailBlocks?: (row: T, index: number) => ExportDetailBlock[];
  getDetailHeading?: (row: T, index: number) => string;
  detailsSectionTitle?: string;
}

export function exportToPrintablePDFWithDetails<T>(options: PDFExportOptions<T>) {
  exportToPrintablePDF(options);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPdfDetailBlockHtml(block: ExportDetailBlock, accentColor: string): string {
  const headers = block.columns.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = block.rows
    .map((row, ri) => {
      const bg = ri % 2 === 0 ? '#ffffff' : '#f9fafb';
      const cells = row
        .map((c) => `<td>${escapeHtml(c == null ? '' : String(c))}</td>`)
        .join('');
      return `<tr style="background-color:${bg};">${cells}</tr>`;
    })
    .join('');
  return `
    <div class="detail-block">
      <h4 class="detail-block-title">${escapeHtml(block.title)}</h4>
      <table class="detail-table">
        <thead><tr style="background:${accentColor};color:#fff;">${headers}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function buildPdfDetailsSectionHtml<T>(
  pdfOptions: PDFExportOptions<T>,
  rows: T[],
  accentColor: string,
): string {
  if (!pdfOptions.buildDetailBlocks) return '';
  const sectionTitle = pdfOptions.detailsSectionTitle ?? 'DÉTAIL PAR CLIENT';
  const parts = rows.map((row, index) => {
    const heading = pdfOptions.getDetailHeading?.(row, index) ?? `Ligne ${index + 1}`;
    const blocks = pdfOptions.buildDetailBlocks!(row, index)
      .map((b) => buildPdfDetailBlockHtml(b, accentColor))
      .join('');
    return `
      <div class="client-detail-card">
        <h3 class="client-detail-heading">${escapeHtml(heading)}</h3>
        ${blocks}
      </div>`;
  });
  return `
    <div class="details-section">
      <h2 class="details-section-title">${escapeHtml(sectionTitle)}</h2>
      ${parts.join('')}
    </div>`;
}

export function exportToPrintablePDF<T>(options: ExportOptions<T> | PDFExportOptions<T>) {
  const { title, filtersDescription, columns, rows } = options;
  
  // Couleurs par défaut ou personnalisées
  const pdfOptions = options as PDFExportOptions<T>;
  const headerColor = pdfOptions.headerColor || '#1e40af'; // Bleu foncé
  const headerTextColor = pdfOptions.headerTextColor || '#ffffff'; // Blanc
  const evenRowColor = pdfOptions.evenRowColor || '#f0f9ff'; // Bleu très clair
  const oddRowColor = pdfOptions.oddRowColor || '#ffffff'; // Blanc
  const accentColor = pdfOptions.accentColor || '#1e40af'; // Bleu foncé
  const totals = pdfOptions.totals || [];
  const branding = pdfOptions.branding;
  const hideDefaultStatBox = pdfOptions.hideDefaultStatBox === true;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const tableHeaders = columns
    .map((c) => `<th>${c.header}</th>`)
    .join('');

  const tableRows = rows
    .map((row, index) => {
      const rowColor = index % 2 === 0 ? evenRowColor : oddRowColor;
      const cells = columns
        .map((c) => {
          const value = c.value(row, index);
          const cellStyle = c.cellStyle ? c.cellStyle(row, index) : undefined;
          
          // Appliquer les styles conditionnels (vert pour positif, rouge pour négatif)
          let styleAttr = '';
          if (cellStyle === 'positive') {
            styleAttr = 'style="color: #166534; font-weight: 600; background-color: rgba(34, 197, 94, 0.1);"';
          } else if (cellStyle === 'negative') {
            styleAttr = 'style="color: #991b1b; font-weight: 600; background-color: rgba(239, 68, 68, 0.1);"';
          }
          
          return `<td ${styleAttr}>${value ?? ''}</td>`;
        })
        .join('');
      return `<tr style="background-color: ${rowColor};">${cells}</tr>`;
    })
    .join('');

  const filtersBlock = filtersDescription
    ? `<div class="filters-box">${filtersDescription}</div>`
    : '';

  const currentDate = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <title>${title}</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 24px;
            color: #111827;
            background: #fff;
            margin: 0;
          }
          .pdf-brand {
            display: flex;
            align-items: center;
            gap: 18px;
            margin-bottom: 22px;
            padding: 18px 20px;
            background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
          }
          .pdf-brand-logo {
            flex-shrink: 0;
            width: 56px;
            height: 56px;
            border-radius: 12px;
            background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
          }
          .pdf-brand-logo svg {
            width: 32px;
            height: 32px;
          }
          .pdf-brand-name {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.03em;
            line-height: 1.2;
          }
          .pdf-brand-tagline {
            font-size: 12px;
            color: #64748b;
            margin-top: 4px;
          }
          .pdf-brand-doc {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            color: ${accentColor};
            font-weight: 700;
            margin-top: 8px;
          }
          .header {
            border-bottom: 3px solid ${accentColor};
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          h1 {
            font-size: 22px;
            margin: 0 0 8px 0;
            color: ${accentColor};
            font-weight: 700;
            letter-spacing: -0.02em;
          }
          .date {
            font-size: 12px;
            color: #6b7280;
            margin: 0;
          }
          .filters-box {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
            font-size: 12px;
            color: #92400e;
          }
          .filters-box::before {
            content: "🔍 ";
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          thead {
            background: linear-gradient(135deg, ${headerColor} 0%, ${adjustColor(headerColor, -20)} 100%);
          }
          thead th {
            padding: 12px 10px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            color: ${headerTextColor};
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: none;
          }
          tbody td {
            padding: 10px;
            font-size: 12px;
            border-bottom: 1px solid #e5e7eb;
            color: #374151;
          }
          tbody tr:hover {
            background-color: #dbeafe !important;
          }
          tbody tr:last-child td {
            border-bottom: none;
          }
          .footer {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
            font-size: 11px;
            color: #9ca3af;
            text-align: center;
          }
          .stats {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
          }
          .stat-box {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border: 1px solid #22c55e;
            border-radius: 8px;
            padding: 12px 20px;
            text-align: center;
          }
          .stat-box.primary {
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border-color: ${accentColor};
          }
          .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: ${accentColor};
          }
          .stat-label {
            font-size: 11px;
            color: #6b7280;
            text-transform: uppercase;
          }
          .totals-section {
            margin-top: 24px;
            padding: 20px;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 12px;
            border: 2px solid ${accentColor};
          }
          .totals-title {
            font-size: 14px;
            font-weight: 700;
            color: ${accentColor};
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e2e8f0;
          }
          .totals-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
          }
          .total-item {
            padding: 16px;
            border-radius: 8px;
            text-align: center;
          }
          .total-item.positive {
            background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
            border: 1px solid #22c55e;
          }
          .total-item.negative {
            background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
            border: 1px solid #ef4444;
          }
          .total-item.neutral {
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            border: 1px solid #9ca3af;
          }
          .total-label {
            font-size: 11px;
            color: #6b7280;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .total-value {
            font-size: 20px;
            font-weight: 700;
          }
          .total-item.positive .total-value {
            color: #166534;
          }
          .total-item.negative .total-value {
            color: #991b1b;
          }
          .total-item.neutral .total-value {
            color: #374151;
          }
          .details-section {
            margin-top: 36px;
            page-break-before: auto;
          }
          .details-section-title {
            font-size: 16px;
            font-weight: 700;
            color: ${accentColor};
            margin: 0 0 20px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid ${accentColor};
          }
          .client-detail-card {
            margin-bottom: 28px;
            padding: 16px;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            background: #fafafa;
            page-break-inside: avoid;
          }
          .client-detail-heading {
            font-size: 14px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 14px 0;
          }
          .detail-block {
            margin-bottom: 16px;
          }
          .detail-block-title {
            font-size: 12px;
            font-weight: 600;
            color: #4b5563;
            margin: 0 0 8px 0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .detail-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          }
          .detail-table thead th {
            padding: 8px 6px;
            text-align: left;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
          }
          .detail-table tbody td {
            padding: 7px 6px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
            tbody tr:hover {
              background-color: inherit !important;
            }
          }
        </style>
      </head>
      <body>
        ${branding ? `
        <div class="pdf-brand">
          <div class="pdf-brand-logo">${TRUCK_LOGO_SVG_MARK}</div>
          <div>
            <div class="pdf-brand-name">${branding.companyName}</div>
            ${branding.tagline ? `<div class="pdf-brand-tagline">${branding.tagline}</div>` : ''}
            ${branding.documentLabel ? `<div class="pdf-brand-doc">${branding.documentLabel}</div>` : ''}
          </div>
        </div>
        ` : ''}
        <div class="header">
          <h1>${title}</h1>
          <p class="date">Document généré le ${currentDate}</p>
        </div>
        ${!hideDefaultStatBox ? `
        <div class="stats">
          <div class="stat-box primary">
            <div class="stat-value">${rows.length}</div>
            <div class="stat-label">Lignes exportées</div>
          </div>
        </div>
        ` : ''}
        ${filtersBlock}
        <table>
          <thead>
            <tr>${tableHeaders}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        ${buildPdfDetailsSectionHtml(pdfOptions, rows, accentColor)}
        ${totals.length > 0 ? `
        <div class="totals-section">
          <div class="totals-title">📊 RÉCAPITULATIF DES TOTAUX</div>
          <div class="totals-grid">
            ${totals.map(t => `
              <div class="total-item ${t.style || 'neutral'}">
                <div class="total-label">${t.icon || ''} ${t.label}</div>
                <div class="total-value">${t.value}</div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
        <div class="footer">
          Document généré automatiquement par TruckTrack • ${currentDate}
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

// Fonction utilitaire pour ajuster la luminosité d'une couleur hexadécimale
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}


