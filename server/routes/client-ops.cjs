'use strict';

const {
  HttpError,
  dateOnly,
  num,
  audit,
  rowToJson,
  randomUUID,
  query,
} = require('../lib.cjs');

function mapOrder(row) {
  if (!row) return null;
  const j = rowToJson(row);
  for (const k of ['montant', 'prixUnitaire', 'quantite']) {
    if (j[k] != null) j[k] = num(j[k]);
  }
  return j;
}

function mapDelivery(row) {
  if (!row) return null;
  const j = rowToJson(row);
  if (j.montantTransport != null) j.montantTransport = num(j.montantTransport);
  return j;
}

async function listOrders(clientId) {
  const q = clientId
    ? await query(
        `SELECT * FROM client_orders WHERE "clientId" = $1 ORDER BY "dateCommande" DESC`,
        [clientId],
      )
    : await query(`SELECT * FROM client_orders ORDER BY "dateCommande" DESC`);
  return q.rows.map(mapOrder);
}

async function getOrder(id) {
  const { rows } = await query(`SELECT * FROM client_orders WHERE id = $1`, [id]);
  return mapOrder(rows[0]);
}

async function listDeliveries(clientId) {
  if (clientId) {
    const { rows } = await query(
      `SELECT d.* FROM client_deliveries d
       JOIN client_orders o ON o.id = d."clientOrderId"
       WHERE o."clientId" = $1 ORDER BY d."datePrevue" DESC NULLS LAST`,
      [clientId],
    );
    return rows.map(mapDelivery);
  }
  const { rows } = await query(`SELECT * FROM client_deliveries`);
  return rows.map(mapDelivery);
}

async function getDelivery(id) {
  const { rows } = await query(`SELECT * FROM client_deliveries WHERE id = $1`, [id]);
  return mapDelivery(rows[0]);
}

function deliveryTransportMontant(d) {
  return Math.max(0, num(d.montantTransport));
}

function deliveryBillsTransport(d) {
  if (d.modeSortie === 'retrait_hub') return false;
  if (deliveryTransportMontant(d) <= 0) return false;
  if (d.statut === 'annulee') return false;
  if (d.transportFactureParFournisseur) return true;
  return Boolean(d.chauffeurId || d.tracteurId);
}

async function nextFacCmd() {
  const year = new Date().getFullYear();
  const prefix = `FAC-CMD-${year}-`;
  const { rows } = await query(`SELECT count(*)::int AS c FROM invoices WHERE numero LIKE $1`, [
    `${prefix}%`,
  ]);
  return `${prefix}${String((rows[0]?.c || 0) + 1).padStart(3, '0')}`;
}

async function ensureOrderInvoice(orderId, payment, actor) {
  const order = await getOrder(orderId);
  if (!order) return;
  const { rows: deliveries } = await query(
    `SELECT * FROM client_deliveries WHERE "clientOrderId" = $1`,
    [orderId],
  );
  const billable = deliveries.filter(deliveryBillsTransport);
  const marchandise = num(order.montant);
  const transportTotal = billable.reduce((s, d) => s + deliveryTransportMontant(d), 0);
  const montant = marchandise + transportTotal;
  if (montant <= 0) return;

  const walkIn = !order.clientId ? order.clientNom?.trim() : undefined;
  const libelle = walkIn
    ? `${walkIn} — ${order.designation}`
    : order.designation;
  const notes = [
    order.reference ? `Commande ${order.reference}` : null,
    marchandise > 0 ? `Marchandise : ${marchandise} FCFA` : null,
    ...billable.map(
      (d) =>
        `Livraison ${d.lieuLivraison || ''} — transport : ${deliveryTransportMontant(d)} FCFA`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  let existing = null;
  if (order.invoiceId) {
    const r = await query(`SELECT * FROM invoices WHERE id = $1`, [order.invoiceId]);
    existing = r.rows[0] || null;
  }
  if (!existing) {
    const r = await query(`SELECT * FROM invoices WHERE "clientOrderId" = $1`, [orderId]);
    existing = r.rows[0] || null;
  }

  let montantPaye = existing ? num(existing.montantPaye) : 0;
  let datePaiement = existing?.datePaiement || null;
  if (payment?.montantPaye != null) {
    montantPaye = Math.min(Math.max(0, num(payment.montantPaye)), montant);
    datePaiement =
      montantPaye > 0
        ? dateOnly(payment.datePaiement) || dateOnly(order.dateCommande)
        : null;
  }
  const statut = montantPaye >= montant - 0.01 ? 'payee' : 'en_attente';

  if (existing) {
    await query(
      `UPDATE invoices SET
        "montantHT"=$2, "montantTTC"=$2, "montantHTApresRemise"=$2,
        "clientTierId"=$3, "clientOrderId"=$4, "factureClientLibelle"=$5,
        notes=$6, "montantPaye"=$7, statut=$8, "datePaiement"=$9, "clientDeliveryId"=NULL
       WHERE id=$1`,
      [
        existing.id,
        montant,
        order.clientId || null,
        orderId,
        libelle,
        notes,
        montantPaye,
        statut,
        datePaiement,
      ],
    );
    if (order.invoiceId !== existing.id) {
      await query(`UPDATE client_orders SET "invoiceId" = $2 WHERE id = $1`, [
        orderId,
        existing.id,
      ]);
    }
  } else {
    const id = randomUUID();
    const numero = await nextFacCmd();
    await query(
      `INSERT INTO invoices (
        id, numero, statut, "montantHT", "montantTTC", "montantHTApresRemise",
        "montantPaye", "dateCreation", "datePaiement", notes,
        "clientTierId", "clientOrderId", "factureClientLibelle"
      ) VALUES ($1,$2,$3,$4,$4,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        numero,
        statut,
        montant,
        montantPaye,
        dateOnly(order.dateCommande) || new Date().toISOString().slice(0, 10),
        datePaiement,
        notes,
        order.clientId || null,
        orderId,
        libelle,
      ],
    );
    await query(`UPDATE client_orders SET "invoiceId" = $2 WHERE id = $1`, [orderId, id]);
  }
}

async function releaseLoadingsForOrder(orderId) {
  const { rows } = await query(
    `SELECT DISTINCT "loadingId" FROM supplier_loading_assignments WHERE "clientOrderId" = $1`,
    [orderId],
  );
  await query(`DELETE FROM supplier_loading_assignments WHERE "clientOrderId" = $1`, [orderId]);
  for (const r of rows) {
    const { rows: left } = await query(
      `SELECT count(*)::int AS c FROM supplier_loading_assignments WHERE "loadingId" = $1`,
      [r.loadingId],
    );
    if ((left[0]?.c || 0) > 0) continue;
    const { rows: loadings } = await query(`SELECT * FROM supplier_loadings WHERE id = $1`, [
      r.loadingId,
    ]);
    const L = loadings[0];
    if (!L || L.statut === 'annule' || L.statut === 'brouillon') continue;
    const hub =
      L.modeEntree === 'rail' ||
      L.hubArrivee ||
      ['au_hub', 'en_dispatch', 'solde'].includes(L.statut);
    const next =
      L.statut === 'en_transit' ? 'en_transit' : hub ? 'au_hub' : 'en_attente_affectation';
    if (next !== L.statut) {
      await query(`UPDATE supplier_loadings SET statut = $2 WHERE id = $1`, [L.id, next]);
    }
  }
}

async function createOrder(body, actor) {
  const id = randomUUID();
  let pu = body.prixUnitaire;
  let designation = body.designation;
  let unite = body.unite;
  if (body.articleId) {
    const { rows } = await query(`SELECT * FROM articles WHERE id = $1`, [body.articleId]);
    if (!rows[0]) throw HttpError(400, 'Article introuvable.');
    if (pu == null || pu <= 0) {
      if (rows[0].prixVente != null && num(rows[0].prixVente) > 0) pu = num(rows[0].prixVente);
    }
    if (!designation) designation = rows[0].libelle;
    if (!unite) unite = rows[0].unite;
  }
  let montant = body.montant;
  if (body.quantite != null && pu != null && num(body.quantite) > 0 && num(pu) > 0) {
    montant = Math.round(num(body.quantite) * num(pu) * 100) / 100;
  }
  await query(
    `INSERT INTO client_orders (
      id, "clientId", "clientNom", "clientTelephone", "clientAdresse", "articleId",
      reference, designation, destination, montant, "prixUnitaire", quantite, unite,
      statut, "dateCommande", "dateLivraisonSouhaitee", notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      body.clientId || null,
      body.clientNom || null,
      body.clientTelephone || null,
      body.clientAdresse || null,
      body.articleId || null,
      body.reference || null,
      designation,
      body.destination || null,
      montant != null ? num(montant) : null,
      pu != null ? num(pu) : null,
      body.quantite != null ? num(body.quantite) : null,
      unite || null,
      body.statut || 'confirmee',
      dateOnly(body.dateCommande),
      dateOnly(body.dateLivraisonSouhaitee),
      body.notes || null,
    ],
  );
  await ensureOrderInvoice(
    id,
    body.montantPaye != null
      ? { montantPaye: body.montantPaye, datePaiement: body.datePaiement }
      : undefined,
    actor,
  );
  const row = await getOrder(id);
  await audit('client-orders', 'CREATE', id, `Commande ${designation}`, null, row, actor);
  return row;
}

async function updateOrder(id, body, actor) {
  const before = await getOrder(id);
  if (!before) throw HttpError(404, 'Commande introuvable');
  if (['livree', 'annulee'].includes(before.statut) && body.statut && body.statut !== before.statut) {
    // allow status changes carefully; Nest blocks some updates when livree
  }
  await query(
    `UPDATE client_orders SET
      "clientId" = COALESCE($2, "clientId"),
      "clientNom" = COALESCE($3, "clientNom"),
      "clientTelephone" = COALESCE($4, "clientTelephone"),
      "clientAdresse" = COALESCE($5, "clientAdresse"),
      "articleId" = COALESCE($6, "articleId"),
      reference = COALESCE($7, reference),
      designation = COALESCE($8, designation),
      destination = COALESCE($9, destination),
      montant = COALESCE($10, montant),
      "prixUnitaire" = COALESCE($11, "prixUnitaire"),
      quantite = COALESCE($12, quantite),
      unite = COALESCE($13, unite),
      statut = COALESCE($14, statut),
      "dateCommande" = COALESCE($15, "dateCommande"),
      "dateLivraisonSouhaitee" = COALESCE($16, "dateLivraisonSouhaitee"),
      notes = COALESCE($17, notes)
     WHERE id = $1`,
    [
      id,
      body.clientId !== undefined ? body.clientId : null,
      body.clientNom !== undefined ? body.clientNom : null,
      body.clientTelephone !== undefined ? body.clientTelephone : null,
      body.clientAdresse !== undefined ? body.clientAdresse : null,
      body.articleId !== undefined ? body.articleId : null,
      body.reference !== undefined ? body.reference : null,
      body.designation ?? null,
      body.destination !== undefined ? body.destination : null,
      body.montant !== undefined ? num(body.montant) : null,
      body.prixUnitaire !== undefined ? num(body.prixUnitaire) : null,
      body.quantite !== undefined ? num(body.quantite) : null,
      body.unite !== undefined ? body.unite : null,
      body.statut ?? null,
      body.dateCommande !== undefined ? dateOnly(body.dateCommande) : null,
      body.dateLivraisonSouhaitee !== undefined ? dateOnly(body.dateLivraisonSouhaitee) : null,
      body.notes !== undefined ? body.notes : null,
    ],
  );
  if (body.statut === 'annulee') await releaseLoadingsForOrder(id);
  await ensureOrderInvoice(
    id,
    body.montantPaye != null
      ? { montantPaye: body.montantPaye, datePaiement: body.datePaiement }
      : undefined,
    actor,
  );
  const after = await getOrder(id);
  await audit('client-orders', 'UPDATE', id, 'Modification commande', before, after, actor);
  return after;
}

async function deleteOrder(id, actor) {
  const before = await getOrder(id);
  if (!before) throw HttpError(404, 'Commande introuvable');
  await releaseLoadingsForOrder(id);
  await query(`DELETE FROM client_deliveries WHERE "clientOrderId" = $1`, [id]);
  await query(`DELETE FROM client_orders WHERE id = $1`, [id]);
  await audit('client-orders', 'DELETE', id, 'Suppression commande', before, null, actor);
}

async function createDelivery(body, actor) {
  const id = randomUUID();
  await query(
    `INSERT INTO client_deliveries (
      id, "clientOrderId", "modeSortie", "lieuLivraison", statut,
      "datePrevue", "dateLivraison", "chauffeurId", "tracteurId",
      "montantTransport", "transportFactureParFournisseur", "transportFournisseurId", notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      body.clientOrderId,
      body.modeSortie || 'livraison_directe',
      body.lieuLivraison || '',
      body.statut || 'planifiee',
      dateOnly(body.datePrevue),
      dateOnly(body.dateLivraison),
      body.chauffeurId || null,
      body.tracteurId || null,
      body.montantTransport != null ? num(body.montantTransport) : null,
      Boolean(body.transportFactureParFournisseur),
      body.transportFournisseurId || null,
      body.notes || null,
    ],
  );
  await ensureOrderInvoice(body.clientOrderId, undefined, actor);
  const row = await getDelivery(id);
  await audit('client-deliveries', 'CREATE', id, 'Création livraison', null, row, actor);
  return row;
}

async function updateDelivery(id, body, actor) {
  const before = await getDelivery(id);
  if (!before) throw HttpError(404, 'Livraison introuvable');
  await query(
    `UPDATE client_deliveries SET
      "modeSortie" = COALESCE($2, "modeSortie"),
      "lieuLivraison" = COALESCE($3, "lieuLivraison"),
      statut = COALESCE($4, statut),
      "datePrevue" = COALESCE($5, "datePrevue"),
      "dateLivraison" = COALESCE($6, "dateLivraison"),
      "chauffeurId" = COALESCE($7, "chauffeurId"),
      "tracteurId" = COALESCE($8, "tracteurId"),
      "montantTransport" = COALESCE($9, "montantTransport"),
      "transportFactureParFournisseur" = COALESCE($10, "transportFactureParFournisseur"),
      "transportFournisseurId" = COALESCE($11, "transportFournisseurId"),
      notes = COALESCE($12, notes)
     WHERE id = $1`,
    [
      id,
      body.modeSortie ?? null,
      body.lieuLivraison ?? null,
      body.statut ?? null,
      body.datePrevue !== undefined ? dateOnly(body.datePrevue) : null,
      body.dateLivraison !== undefined ? dateOnly(body.dateLivraison) : null,
      body.chauffeurId !== undefined ? body.chauffeurId : null,
      body.tracteurId !== undefined ? body.tracteurId : null,
      body.montantTransport !== undefined ? num(body.montantTransport) : null,
      body.transportFactureParFournisseur !== undefined
        ? Boolean(body.transportFactureParFournisseur)
        : null,
      body.transportFournisseurId !== undefined ? body.transportFournisseurId : null,
      body.notes !== undefined ? body.notes : null,
    ],
  );
  await ensureOrderInvoice(before.clientOrderId, undefined, actor);
  const after = await getDelivery(id);
  await audit('client-deliveries', 'UPDATE', id, 'Modification livraison', before, after, actor);
  return after;
}

async function deleteDelivery(id, actor) {
  const before = await getDelivery(id);
  if (!before) throw HttpError(404, 'Livraison introuvable');
  const orderId = before.clientOrderId;
  await query(`DELETE FROM client_deliveries WHERE id = $1`, [id]);
  await ensureOrderInvoice(orderId, undefined, actor);
  await audit('client-deliveries', 'DELETE', id, 'Suppression livraison', before, null, actor);
}

module.exports = {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  listDeliveries,
  getDelivery,
  createDelivery,
  updateDelivery,
  deleteDelivery,
};
