/**
 * Identité visuelle commune aux PDF factures (liste + facture unitaire).
 */

import { BRAND_NAME } from '@/lib/brand';

/** Raison sociale affichée sur les documents (logo ANSA'R). */
export const COMPANY_NAME = "ANSA'R sarl";

export const COMPANY_TAGLINE = 'Transport · Prestation de services · Commerce général';

export const COMPANY_BP = 'BP: 11730 Douala';
export const COMPANY_PHONE = '699118719 / 650500839';
export const COMPANY_EMAIL = 'steansar1@gmail.com';
export const COMPANY_NIU = 'M021712602540C';
export const COMPANY_CONTACT = `${COMPANY_BP} · Tél: ${COMPANY_PHONE} · Email: ${COMPANY_EMAIL} · NIU: ${COMPANY_NIU}`;

/** Logo entreprise pour PDF / impressions (chemin public). */
export function getCompanyLogoSrc(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/logo-ansar.png`;
}

export function getCompanyLogoImgHtml(heightPx = 36): string {
  return `<img src="${getCompanyLogoSrc()}" alt="${COMPANY_NAME}" style="height:${heightPx}px;width:auto;max-width:180px;object-fit:contain;display:block;" />`;
}

/** Icône camion (SVG), fond généralement ajouté par le conteneur (fallback legacy). */
export const TRUCK_LOGO_SVG_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;

/** Marque UI / produit (distincte de la raison sociale). */
export { BRAND_NAME };
