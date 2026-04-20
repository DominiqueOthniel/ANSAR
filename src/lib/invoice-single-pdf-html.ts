import type { Expense, Invoice, ParcelExpedition, Trip } from '@/contexts/AppContext';
import { COMPANY_CONTACT, COMPANY_NAME, COMPANY_TAGLINE, TRUCK_LOGO_SVG_MARK } from '@/lib/invoice-branding';
import { formatTripStatusFr } from '@/lib/sync-utils';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parcelClientsSummary(pe: ParcelExpedition): string {
  const raw = pe.lots.map((l) => l.clients?.trim()).filter(Boolean) as string[];
  const uniq = [...new Set(raw)];
  return uniq.length ? uniq.join(', ') : '—';
}

export function buildSingleInvoicePdfInnerHtml(opts: {
  invoice: Invoice;
  dejaPaye: number;
  resteAPayer: number;
  trip?: Trip;
  expense?: Expense;
  parcelExpedition?: ParcelExpedition | null;
  driver?: { prenom: string; nom: string; telephone?: string } | null;
  fournisseurNom?: string | null;
  getTruckLabel: (id: string) => string;
}): string {
  const { invoice, dejaPaye, resteAPayer, trip, expense, parcelExpedition, driver, fournisseurNom, getTruckLabel } =
    opts;

  const statusLabel =
    resteAPayer <= 0.01 ? 'Payée' : dejaPaye > 0 ? 'Paiement partiel' : 'En attente';
  const statusBg = resteAPayer <= 0.01 ? '#dcfce7' : dejaPaye > 0 ? '#dbeafe' : '#fef9c3';
  const statusFg = resteAPayer <= 0.01 ? '#166534' : dejaPaye > 0 ? '#1d4ed8' : '#a16207';

  const partyLabel = expense ? 'Fournisseur' : 'Client';
  const partyName = expense
    ? fournisseurNom || '—'
    : trip
      ? trip.client || '—'
      : parcelExpedition
        ? parcelClientsSummary(parcelExpedition)
        : '—';

  let detailBlock = '';
  if (trip) {
    detailBlock = `
                <div class="mb-8">
                  <h3 class="font-bold text-lg mb-4 uppercase" style="letter-spacing:0.06em;font-size:13px;color:#475569;">Détails du transport</h3>
                  <div class="border rounded-lg overflow-hidden" style="border-color:#e2e8f0;">
                    <table class="w-full">
                      <thead class="bg-gray-100">
                        <tr>
                          <th class="p-3 text-left font-bold text-sm">Prestation</th>
                          <th class="p-3 text-right font-bold text-sm">Montant TTC</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr class="border-t border-gray-200">
                          <td class="p-3">
                            <div>
                              <p class="font-semibold">Transport ${trip.origine} → ${trip.destination}</p>
                              ${driver ? `<p class="text-xs text-gray-600">Chauffeur : ${driver.prenom} ${driver.nom}</p>` : ''}
                              ${trip.marchandise ? `<p class="text-xs text-gray-600">Marchandise : ${trip.marchandise}</p>` : ''}
                              ${trip.description ? `<p class="text-xs text-gray-600">${escapeHtml(trip.description)}</p>` : ''}
                            </div>
                          </td>
                          <td class="p-3 text-right font-bold">
                            ${invoice.montantTTC.toLocaleString('fr-FR')} FCFA
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="mb-8 grid grid-cols-2 gap-6">
                  <div>
                    <p class="font-semibold mb-2">Informations complémentaires</p>
                    <div class="text-sm space-y-1">
                      ${driver ? `<p class="text-gray-600">Chauffeur : <span class="text-black">${driver.prenom} ${driver.nom}</span></p>` : ''}
                      ${trip.tracteurId ? `<p class="text-gray-600">Tracteur : <span class="text-black">${getTruckLabel(trip.tracteurId)}</span></p>` : ''}
                      ${trip.remorqueuseId ? `<p class="text-gray-600">Remorque : <span class="text-black">${getTruckLabel(trip.remorqueuseId)}</span></p>` : ''}
                      <p class="text-gray-600">Statut trajet : <span class="text-black" style="${trip.statut === 'annule' ? 'color:#b91c1c;font-weight:600;' : ''}">${formatTripStatusFr(trip.statut)}</span></p>
                      <p class="text-gray-600">Départ : <span class="text-black">${new Date(trip.dateDepart).toLocaleDateString('fr-FR')}</span></p>
                      ${trip.dateArrivee ? `<p class="text-gray-600">Arrivée : <span class="text-black">${new Date(trip.dateArrivee).toLocaleDateString('fr-FR')}</span></p>` : ''}
                    </div>
                  </div>
                  <div>
                    ${invoice.modePaiement ? `
                      <p class="font-semibold mb-2">Référence paiement</p>
                      <p class="text-sm text-gray-600">Mode : <span class="text-black">${escapeHtml(invoice.modePaiement)}</span></p>
                    ` : ''}
                  </div>
                </div>`;
  } else if (expense) {
    detailBlock = `
                <div class="mb-8">
                  <h3 class="font-bold text-lg mb-4 uppercase" style="letter-spacing:0.06em;font-size:13px;color:#475569;">Détail de la dépense facturée</h3>
                  <div class="border rounded-lg overflow-hidden" style="border-color:#e2e8f0;">
                    <table class="w-full">
                      <thead class="bg-gray-100">
                        <tr>
                          <th class="p-3 text-left font-bold text-sm">Description</th>
                          <th class="p-3 text-right font-bold text-sm">Montant TTC</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr class="border-t border-gray-200">
                          <td class="p-3">
                            <p class="font-semibold">${escapeHtml(expense.description)}</p>
                            <p class="text-xs text-gray-600">${escapeHtml(expense.categorie)}${expense.sousCategorie ? ' · ' + escapeHtml(expense.sousCategorie) : ''}</p>
                            <p class="text-xs text-gray-600 mt-1">Date dépense : ${new Date(expense.date).toLocaleDateString('fr-FR')}</p>
                          </td>
                          <td class="p-3 text-right font-bold">${invoice.montantTTC.toLocaleString('fr-FR')} FCFA</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>`;
  } else if (parcelExpedition) {
    const pe = parcelExpedition;
    const dateArriveeMs = pe.dateArrivee?.trim() ? new Date(pe.dateArrivee).getTime() : NaN;
    const hasArriveeValide = !Number.isNaN(dateArriveeMs);
    const lotsRows = pe.lots
      .map(
        (l) => `
                        <tr class="border-t border-gray-200">
                          <td class="p-2 text-sm">${escapeHtml(l.clients)}</td>
                          <td class="p-2 text-sm">${escapeHtml(l.unite)}</td>
                          <td class="p-2 text-sm text-right">${l.quantite.toLocaleString('fr-FR')}</td>
                          <td class="p-2 text-sm text-right">${l.prixUnitaire.toLocaleString('fr-FR')}</td>
                          <td class="p-2 text-sm text-right font-semibold">${l.montant.toLocaleString('fr-FR')}</td>
                          <td class="p-2 text-xs text-gray-600">${l.observations ? escapeHtml(l.observations) : '—'}</td>
                        </tr>`,
      )
      .join('');
    detailBlock = `
                <div class="mb-8">
                  <h3 class="font-bold text-lg mb-4 uppercase" style="letter-spacing:0.06em;font-size:13px;color:#475569;">Détails de l'expédition</h3>
                  <p class="text-sm text-gray-600 mb-3">Réf. <span class="font-semibold text-black">${escapeHtml(pe.reference)}</span> · ${escapeHtml(pe.origine)} → ${escapeHtml(pe.destination)}</p>
                  <div class="border rounded-lg overflow-hidden" style="border-color:#e2e8f0;">
                    <table class="w-full">
                      <thead class="bg-gray-100">
                        <tr>
                          <th class="p-2 text-left font-bold text-xs">Client / ligne</th>
                          <th class="p-2 text-left font-bold text-xs">Unité</th>
                          <th class="p-2 text-right font-bold text-xs">Qté</th>
                          <th class="p-2 text-right font-bold text-xs">PU</th>
                          <th class="p-2 text-right font-bold text-xs">Montant</th>
                          <th class="p-2 text-left font-bold text-xs">Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${lotsRows}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="mb-8 grid grid-cols-2 gap-6">
                  <div>
                    <p class="font-semibold mb-2">Informations complémentaires</p>
                    <div class="text-sm space-y-1">
                      ${driver ? `<p class="text-gray-600">Chauffeur : <span class="text-black">${driver.prenom} ${driver.nom}</span>${driver.telephone ? ` · ${escapeHtml(driver.telephone)}` : ''}</p>` : ''}
                      ${pe.tracteurId ? `<p class="text-gray-600">Tracteur : <span class="text-black">${getTruckLabel(pe.tracteurId)}</span></p>` : ''}
                      ${pe.remorqueuseId ? `<p class="text-gray-600">Remorque : <span class="text-black">${getTruckLabel(pe.remorqueuseId)}</span></p>` : ''}
                      <p class="text-gray-600">Statut expédition : <span class="text-black" style="${pe.statut === 'annule' ? 'color:#b91c1c;font-weight:600;' : ''}">${formatTripStatusFr(pe.statut)}</span></p>
                      <p class="text-gray-600">Départ : <span class="text-black">${new Date(pe.dateDepart).toLocaleDateString('fr-FR')}</span></p>
                      ${hasArriveeValide ? `<p class="text-gray-600">Arrivée : <span class="text-black">${new Date(pe.dateArrivee!).toLocaleDateString('fr-FR')}</span></p>` : ''}
                      ${pe.description ? `<p class="text-gray-600 mt-2">${escapeHtml(pe.description)}</p>` : ''}
                    </div>
                  </div>
                  <div>
                    ${invoice.modePaiement ? `
                      <p class="font-semibold mb-2">Référence paiement</p>
                      <p class="text-sm text-gray-600">Mode : <span class="text-black">${escapeHtml(invoice.modePaiement)}</span></p>
                    ` : ''}
                  </div>
                </div>`;
  }

  const notesBlock = invoice.notes
    ? `
            <div class="mt-8 border-t border-gray-200 pt-4">
              <p class="font-semibold mb-2">Remarques</p>
              <p class="text-sm text-gray-600">${escapeHtml(invoice.notes)}</p>
            </div>`
    : '';

  return `
        <div style="max-width: 800px; margin: 0 auto;">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;padding:20px 22px;background:linear-gradient(135deg,#f8fafc 0%,#eff6ff 100%);border:1px solid #e2e8f0;border-radius:14px;">
            <div style="flex-shrink:0;width:56px;height:56px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#2563eb);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 14px rgba(37,99,235,0.35);">
              ${TRUCK_LOGO_SVG_MARK}
            </div>
            <div>
              <div style="font-size:19px;font-weight:800;color:#0f172a;letter-spacing:-0.03em;line-height:1.2;">${COMPANY_NAME}</div>
              <div style="font-size:12px;color:#64748b;margin-top:6px;">${COMPANY_TAGLINE}</div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">${COMPANY_CONTACT}</div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:22px;border-bottom:2px solid #cbd5e1;">
            <div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#64748b;font-weight:700;">Facture</div>
              <h1 style="font-size:28px;font-weight:800;margin:8px 0 0 0;color:#0f172a;letter-spacing:-0.03em;">${escapeHtml(invoice.numero)}</h1>
              <p style="font-size:13px;color:#64748b;margin:10px 0 0 0;">Date d'émission : ${new Date(invoice.dateCreation).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <span style="display:inline-block;padding:10px 16px;border-radius:10px;background:${statusBg};color:${statusFg};font-size:12px;font-weight:700;">${statusLabel}</span>
          </div>

          <div class="grid grid-cols-2 gap-8 mb-8 pb-6 border-b border-gray-200">
            <div>
              <h2 class="font-bold text-sm mb-3 uppercase" style="letter-spacing:0.1em;color:#64748b;">Émetteur</h2>
              <p class="font-bold text-base" style="color:#0f172a;">${COMPANY_NAME}</p>
              <p class="text-sm text-gray-600 mt-2" style="line-height:1.6;">Transport de marchandises<br/>Douala, Cameroun<br/>${COMPANY_CONTACT}</p>
            </div>
            <div class="text-right">
              <h2 class="font-bold text-sm mb-3 uppercase" style="letter-spacing:0.1em;color:#64748b;">${partyLabel}</h2>
              <p class="font-semibold text-lg" style="color:#0f172a;">${escapeHtml(partyName)}</p>
            </div>
          </div>

          ${detailBlock}

          <div class="flex justify-end mb-8">
            <div class="w-64" style="min-width:280px;">
              <div class="border-t-2 border-gray-300 pt-4">
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Montant HT initial :</span>
                    <span class="font-semibold">${invoice.montantHT.toLocaleString('fr-FR')} FCFA</span>
                  </div>
                  ${invoice.remise && invoice.remise > 0 && invoice.montantHTApresRemise ? `
                    <div class="flex justify-between items-center text-orange-600">
                      <span class="text-gray-600">Remise (${invoice.remise}%) :</span>
                      <span class="font-semibold">-${(invoice.montantHT - invoice.montantHTApresRemise).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                    </div>
                    <div class="flex justify-between items-center pt-1 border-t border-gray-200">
                      <span class="text-gray-600">Montant HT après remise :</span>
                      <span class="font-semibold">${invoice.montantHTApresRemise.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                    </div>
                  ` : ''}
                  ${invoice.tva && invoice.tva > 0 ? `
                    <div class="flex justify-between items-center">
                      <span class="text-gray-600">TVA :</span>
                      <span class="font-semibold">${invoice.tva.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                    </div>
                  ` : ''}
                  ${invoice.tps && invoice.tps > 0 ? `
                    <div class="flex justify-between items-center">
                      <span class="text-gray-600">TPS :</span>
                      <span class="font-semibold">${invoice.tps.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                    </div>
                  ` : ''}
                  <div class="flex justify-between items-center pt-2 border-t border-gray-300">
                    <span class="font-bold text-lg">Montant TTC :</span>
                    <span class="font-bold text-2xl">${invoice.montantTTC.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                  </div>
                  <div class="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span class="text-gray-600">Montant déjà payé :</span>
                    <span class="font-semibold text-green-700">${dejaPaye.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-600">Reste à payer :</span>
                    <span class="font-semibold ${resteAPayer > 0.01 ? 'text-orange-700' : 'text-green-700'}">${resteAPayer.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          ${notesBlock}

          <div class="mt-12 pt-8 border-t-2 border-gray-300 text-center">
            <p class="font-bold text-sm">${COMPANY_NAME}</p>
            <p class="text-sm text-gray-600 mt-1">Merci pour votre confiance.</p>
          </div>
        </div>
      `;
}
