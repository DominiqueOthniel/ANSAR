/**
 * Reçu PDF d’un bon de chargement fournisseur (impression individuelle).
 */

import type { SupplierLoading } from '@/contexts/AppContext';
import {
  COMPANY_CONTACT,
  COMPANY_NAME,
  COMPANY_TAGLINE,
  getCompanyLogoImgHtml,
} from '@/lib/invoice-branding';
import { formatLoadingEntryModeFr } from '@/lib/hub-transit';
import { escapePdfHtml, formatPdfDate, formatPdfDateTime } from '@/lib/pdf-print';
import {
  formatSupplierLoadingStatusFr,
  getActiveLoadingAssignments,
  getLoadingRemainderQty,
  sumLoadingAssignedQty,
} from '@/lib/supplier-loadings';
import {
  formatClientDisplayName,
  getClientAccountKey,
} from '@/lib/client-operations';

const S = {
  muted: '#64748b',
  border: '#e2e8f0',
  ink: '#0f172a',
  accent: '#0f766e',
};

function fcfa(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid ${S.border};font-size:8pt;color:${S.muted};width:38%;vertical-align:top;">${escapePdfHtml(label)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid ${S.border};font-size:9pt;font-weight:600;color:${S.ink};vertical-align:top;">${value}</td>
  </tr>`;
}

export type LoadingReceiptClientResolver = (clientId: string) => string | undefined;

export function buildLoadingReceiptPdfInnerHtml(opts: {
  loading: SupplierLoading;
  truckLabel?: string | null;
  resolveClientName?: LoadingReceiptClientResolver;
}): string {
  const { loading: l, truckLabel, resolveClientName } = opts;
  const bonRef = l.numeroBon?.trim() || l.id.slice(0, 8).toUpperCase();
  const statusLabel = formatSupplierLoadingStatusFr(l.statut);
  const isCancelled = l.statut === 'annule';
  const statusBg = isCancelled ? '#fee2e2' : '#ccfbf1';
  const statusFg = isCancelled ? '#991b1b' : '#0f766e';

  const qty =
    l.quantite != null
      ? `${l.quantite.toLocaleString('fr-FR')}${l.unite ? ` ${escapePdfHtml(l.unite)}` : ''}`
      : '—';
  const assigned = sumLoadingAssignedQty(l.assignments);
  const remainder = getLoadingRemainderQty(l.quantite, l.assignments);
  const qtyDetail =
    assigned > 0
      ? `<span style="font-weight:500;color:${S.muted};font-size:8pt;"> · Affecté ${assigned.toLocaleString('fr-FR')}${
          remainder != null ? ` · Reste ${remainder.toLocaleString('fr-FR')}` : ''
        }</span>`
      : '';

  const active = getActiveLoadingAssignments(l.assignments);
  const resolveName = resolveClientName ?? (() => undefined);
  const clients = [
    ...new Map(
      active.map((a) => {
        const name = formatClientDisplayName(a, resolveName);
        return [getClientAccountKey(a), name] as const;
      }),
    ).values(),
  ];
  const clientsHtml =
    clients.length === 0
      ? 'Non attribué'
      : escapePdfHtml(clients.join(', '));

  const ordersHtml =
    active.length === 0
      ? '—'
      : active
          .map((a) => {
            const ref = a.orderReference?.trim();
            const des = a.orderDesignation?.trim() || 'Commande';
            const q =
              a.quantiteAffectee != null
                ? ` (${a.quantiteAffectee.toLocaleString('fr-FR')}${l.unite ? ` ${l.unite}` : ''})`
                : '';
            return escapePdfHtml(`${ref ? `${ref} · ` : ''}${des}${q}`);
          })
          .join('<br/>');

  const modeLabel = formatLoadingEntryModeFr(l.modeEntree);
  const transportBits: string[] = [modeLabel];
  if (truckLabel) transportBits.push(`Camion : ${truckLabel}`);
  if (l.hubArrivee) transportBits.push(`Hub : ${l.hubArrivee}`);
  if (l.lieu) transportBits.push(`Lieu : ${l.lieu}`);

  const notesBlock = l.notes?.trim()
    ? `<div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border-radius:6px;border:1px solid ${S.border};">
        <p style="margin:0 0 2px;font-size:7.5pt;font-weight:700;color:${S.muted};text-transform:uppercase;">Notes</p>
        <p style="margin:0;font-size:8.5pt;color:${S.ink};line-height:1.4;">${escapePdfHtml(l.notes.trim())}</p>
      </div>`
    : '';

  return `
    <div class="pdf-no-break" style="width:100%;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;background:linear-gradient(135deg,#f8fafc,#f0fdfa);border:1px solid ${S.border};border-radius:10px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <div style="flex-shrink:0;padding:6px 8px;background:#fff;border:1px solid ${S.border};border-radius:8px;">
            ${getCompanyLogoImgHtml()}
          </div>
          <div style="min-width:0;">
            <div style="font-size:12pt;font-weight:800;color:${S.ink};letter-spacing:-0.02em;">${COMPANY_NAME}</div>
            <p style="margin:2px 0 0;font-size:7.5pt;color:${S.muted};">${COMPANY_TAGLINE}</p>
            <p style="margin:1px 0 0;font-size:7.5pt;color:${S.muted};">${COMPANY_CONTACT}</p>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <p style="margin:0;font-size:7pt;text-transform:uppercase;letter-spacing:0.12em;color:${S.muted};font-weight:700;">Reçu — Bon de chargement</p>
          <p style="margin:2px 0 0;font-size:14pt;font-weight:800;color:${S.ink};">${escapePdfHtml(bonRef)}</p>
          <p style="margin:4px 0 0;font-size:7.5pt;color:${S.muted};">Émis le ${formatPdfDate(l.dateChargement)}</p>
          <span style="display:inline-block;margin-top:6px;padding:4px 10px;border-radius:6px;background:${statusBg};color:${statusFg};font-size:7.5pt;font-weight:700;">${escapePdfHtml(statusLabel)}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div style="padding:8px 10px;border:1px solid ${S.border};border-radius:6px;">
          <p style="margin:0 0 4px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;color:${S.muted};font-weight:700;">Émetteur</p>
          <p style="margin:0;font-size:9.5pt;font-weight:700;color:${S.ink};">${COMPANY_NAME}</p>
          <p style="margin:3px 0 0;font-size:7.5pt;color:${S.muted};line-height:1.4;">${COMPANY_CONTACT}</p>
        </div>
        <div style="padding:8px 10px;border:1px solid ${S.border};border-radius:6px;text-align:right;">
          <p style="margin:0 0 4px;font-size:7pt;text-transform:uppercase;letter-spacing:0.1em;color:${S.muted};font-weight:700;">Fournisseur</p>
          <p style="margin:0;font-size:10pt;font-weight:700;color:${S.ink};">${escapePdfHtml(l.fournisseurNom || '—')}</p>
          ${
            l.dateLivraison
              ? `<p style="margin:4px 0 0;font-size:7.5pt;color:${S.muted};">Livraison prévue : ${formatPdfDate(l.dateLivraison)}</p>`
              : ''
          }
        </div>
      </div>

      <div style="border:1px solid ${S.border};border-radius:8px;overflow:hidden;margin-bottom:10px;">
        <table style="width:100%;border-collapse:collapse;">
          <tbody>
            ${row('Désignation', escapePdfHtml(l.designation))}
            ${row('Quantité', `${qty}${qtyDetail}`)}
            ${row('Valeur du bon', l.montantBon != null ? escapePdfHtml(fcfa(l.montantBon)) : '—')}
            ${row('Mode / transport', escapePdfHtml(transportBits.join(' · ')))}
            ${row('Client(s)', clientsHtml)}
            ${row('Commande(s)', ordersHtml)}
          </tbody>
        </table>
      </div>

      ${
        l.montantBon != null
          ? `<div style="margin-top:4px;padding:10px 12px;border:2px solid ${S.accent};border-radius:8px;background:#f0fdfa;display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <span style="font-size:8pt;text-transform:uppercase;letter-spacing:0.08em;color:${S.muted};font-weight:700;">Montant reçu</span>
              <span style="font-size:14pt;font-weight:800;color:${S.ink};">${escapePdfHtml(fcfa(l.montantBon))}</span>
            </div>`
          : ''
      }

      ${notesBlock}

      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div style="padding-top:28px;border-top:1px solid ${S.border};text-align:center;font-size:7.5pt;color:${S.muted};">Signature fournisseur</div>
        <div style="padding-top:28px;border-top:1px solid ${S.border};text-align:center;font-size:7.5pt;color:${S.muted};">Signature ANSA'R</div>
      </div>

      <p style="margin:14px 0 0;text-align:center;font-size:7pt;color:#94a3b8;">Document généré le ${escapePdfHtml(formatPdfDateTime())} — reçu de bon de chargement</p>
    </div>`;
}

export function loadingReceiptPrintTitle(loading: SupplierLoading): string {
  const ref = loading.numeroBon?.trim() || loading.id.slice(0, 8).toUpperCase();
  return `Reçu bon ${ref}`;
}
