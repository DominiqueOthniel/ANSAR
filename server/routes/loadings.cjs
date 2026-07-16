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

function mapLoading(row) {
  if (!row) return null;
  const j = rowToJson(row);
  if (j.quantite != null) j.quantite = num(j.quantite);
  if (j.montantBon != null) j.montantBon = num(j.montantBon);
  return j;
}

function mapAssign(row) {
  if (!row) return null;
  const j = rowToJson(row);
  if (j.quantiteAffectee != null) j.quantiteAffectee = num(j.quantiteAffectee);
  return j;
}

async function loadAssignments(loadingId) {
  const { rows } = await query(
    `SELECT a.*, o.designation AS "orderDesignation", o.reference AS "orderReference",
            o.statut AS "orderStatus", o."clientId" AS "clientId",
            COALESCE(tp.nom, o."clientNom") AS "clientNom"
     FROM supplier_loading_assignments a
     LEFT JOIN client_orders o ON o.id = a."clientOrderId"
     LEFT JOIN third_parties tp ON tp.id = o."clientId"
     WHERE a."loadingId" = $1`,
    [loadingId],
  );
  return rows.map(mapAssign);
}

async function computeStatut(loading, assignments) {
  if (loading.statut === 'annule' || loading.statut === 'brouillon') return loading.statut;
  const active = (assignments || []).filter((a) => a.orderStatus !== 'annulee');
  const totalQty = loading.quantite != null ? num(loading.quantite) : null;
  const assigned = active.reduce(
    (s, a) => s + (a.quantiteAffectee != null && a.quantiteAffectee > 0 ? num(a.quantiteAffectee) : 0),
    0,
  );
  const isHub =
    loading.modeEntree === 'rail' ||
    Boolean(loading.hubArrivee?.trim?.() || loading.hubArrivee) ||
    ['au_hub', 'en_dispatch', 'solde', 'en_transit'].includes(loading.statut);

  if (isHub) {
    if (loading.statut === 'en_transit') return 'en_transit';
    if (totalQty != null && totalQty > 0) {
      if (assigned <= 1e-6) return 'au_hub';
      if (assigned >= totalQty - 1e-6) return 'solde';
      return 'en_dispatch';
    }
    return active.length ? 'en_dispatch' : 'au_hub';
  }

  if (totalQty != null && totalQty > 0) {
    if (assigned <= 1e-6) return 'en_attente_affectation';
    if (assigned >= totalQty - 1e-6) return 'affecte';
    return 'partiellement_affecte';
  }
  return active.length ? 'affecte' : 'en_attente_affectation';
}

async function getLoading(id) {
  const { rows } = await query(`SELECT * FROM supplier_loadings WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const L = mapLoading(rows[0]);
  const { rows: f } = await query(`SELECT nom FROM third_parties WHERE id = $1`, [
    L.fournisseurId,
  ]);
  L.fournisseurNom = f[0]?.nom;
  L.assignments = await loadAssignments(id);
  return L;
}

async function listLoadings(params = {}) {
  let sql = `SELECT * FROM supplier_loadings WHERE 1=1`;
  const args = [];
  if (params.fournisseurId) {
    args.push(params.fournisseurId);
    sql += ` AND "fournisseurId" = $${args.length}`;
  }
  if (params.statut) {
    args.push(params.statut);
    sql += ` AND statut = $${args.length}`;
  }
  sql += ` ORDER BY "dateChargement" DESC`;
  const { rows } = await query(sql, args);
  const out = [];
  for (const r of rows) {
    const L = mapLoading(r);
    const { rows: f } = await query(`SELECT nom FROM third_parties WHERE id = $1`, [
      L.fournisseurId,
    ]);
    L.fournisseurNom = f[0]?.nom;
    L.assignments = await loadAssignments(L.id);
    if (params.unassignedOnly === 'true' || params.unassignedOnly === true) {
      const active = L.assignments.filter((a) => a.orderStatus !== 'annulee');
      const totalQty = L.quantite;
      if (totalQty == null || totalQty <= 0) {
        if (active.length > 0) continue;
      } else {
        const assigned = active.reduce(
          (s, a) => s + (a.quantiteAffectee > 0 ? a.quantiteAffectee : 0),
          0,
        );
        if (assigned >= totalQty - 1e-6) continue;
      }
    }
    out.push(L);
  }
  return out;
}

async function createLoading(body, actor) {
  const id = randomUUID();
  let designation = body.designation;
  let unite = body.unite;
  if (body.articleId && !designation) {
    const { rows } = await query(`SELECT libelle, unite FROM articles WHERE id = $1`, [
      body.articleId,
    ]);
    if (rows[0]) {
      designation = rows[0].libelle;
      unite = unite || rows[0].unite;
    }
  }
  const modeEntree = body.modeEntree || 'bon_simple';
  let statut = body.statut;
  if (!statut) {
    if (modeEntree === 'rail' || body.hubArrivee) statut = body.dateArriveeHub ? 'au_hub' : 'en_transit';
    else statut = 'en_attente_affectation';
  }
  await query(
    `INSERT INTO supplier_loadings (
      id, "fournisseurId", "numeroBon", "articleId", designation, quantite, unite,
      "montantBon", "dateChargement", "dateLivraison", statut, lieu, "modeEntree",
      "camionId", "hubArrivee", "dateArriveeHub", notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id,
      body.fournisseurId,
      body.numeroBon || null,
      body.articleId || null,
      designation,
      body.quantite != null ? num(body.quantite) : null,
      unite || null,
      body.montantBon != null ? num(body.montantBon) : null,
      dateOnly(body.dateChargement),
      dateOnly(body.dateLivraison),
      statut,
      body.lieu || null,
      modeEntree,
      body.camionId || null,
      body.hubArrivee || null,
      dateOnly(body.dateArriveeHub),
      body.notes || null,
    ],
  );
  return getLoading(id);
}

async function updateLoading(id, body, actor) {
  const before = await getLoading(id);
  if (!before) throw HttpError(404, 'Bon introuvable');
  if (before.statut === 'annule' && body.statut !== 'annule') {
    throw HttpError(400, 'Bon annulé.');
  }
  await query(
    `UPDATE supplier_loadings SET
      "fournisseurId" = COALESCE($2, "fournisseurId"),
      "numeroBon" = COALESCE($3, "numeroBon"),
      "articleId" = COALESCE($4, "articleId"),
      designation = COALESCE($5, designation),
      quantite = COALESCE($6, quantite),
      unite = COALESCE($7, unite),
      "montantBon" = COALESCE($8, "montantBon"),
      "dateChargement" = COALESCE($9, "dateChargement"),
      "dateLivraison" = COALESCE($10, "dateLivraison"),
      statut = COALESCE($11, statut),
      lieu = COALESCE($12, lieu),
      "modeEntree" = COALESCE($13, "modeEntree"),
      "camionId" = COALESCE($14, "camionId"),
      "hubArrivee" = COALESCE($15, "hubArrivee"),
      "dateArriveeHub" = COALESCE($16, "dateArriveeHub"),
      notes = COALESCE($17, notes)
     WHERE id = $1`,
    [
      id,
      body.fournisseurId ?? null,
      body.numeroBon !== undefined ? body.numeroBon : null,
      body.articleId !== undefined ? body.articleId : null,
      body.designation ?? null,
      body.quantite !== undefined ? num(body.quantite) : null,
      body.unite !== undefined ? body.unite : null,
      body.montantBon !== undefined ? num(body.montantBon) : null,
      body.dateChargement !== undefined ? dateOnly(body.dateChargement) : null,
      body.dateLivraison !== undefined ? dateOnly(body.dateLivraison) : null,
      body.statut ?? null,
      body.lieu !== undefined ? body.lieu : null,
      body.modeEntree ?? null,
      body.camionId !== undefined ? body.camionId : null,
      body.hubArrivee !== undefined ? body.hubArrivee : null,
      body.dateArriveeHub !== undefined ? dateOnly(body.dateArriveeHub) : null,
      body.notes !== undefined ? body.notes : null,
    ],
  );
  const mid = await getLoading(id);
  if (mid && mid.statut !== 'annule' && body.statut !== 'brouillon') {
    const next = await computeStatut(mid, mid.assignments);
    if (next !== mid.statut) {
      await query(`UPDATE supplier_loadings SET statut = $2 WHERE id = $1`, [id, next]);
    }
  }
  const after = await getLoading(id);
  await audit('supplier-loadings', 'UPDATE', id, 'Modification bon', before, after, actor);
  return after;
}

async function deleteLoading(id, actor) {
  const before = await getLoading(id);
  if (!before) throw HttpError(404, 'Bon introuvable');
  await query(`DELETE FROM supplier_loading_assignments WHERE "loadingId" = $1`, [id]);
  await query(`DELETE FROM supplier_loadings WHERE id = $1`, [id]);
  await audit('supplier-loadings', 'DELETE', id, 'Suppression bon', before, null, actor);
}

async function setAssignments(id, body, actor) {
  const loading = await getLoading(id);
  if (!loading) throw HttpError(404, 'Bon introuvable');
  if (loading.statut === 'annule') throw HttpError(400, 'Un bon annulé ne peut plus être affecté.');
  const items = body.assignments || [];
  const orderIds = items.map((a) => a.clientOrderId);
  if (new Set(orderIds).size !== orderIds.length) {
    throw HttpError(400, 'Une commande ne peut être liée qu’une fois par bon.');
  }
  if (orderIds.length) {
    const { rows: orders } = await query(
      `SELECT id, statut FROM client_orders WHERE id = ANY($1::uuid[])`,
      [orderIds],
    );
    if (orders.length !== orderIds.length) {
      throw HttpError(400, 'Une ou plusieurs commandes client sont introuvables.');
    }
    if (orders.some((o) => o.statut === 'annulee')) {
      throw HttpError(400, 'Impossible d’affecter à une commande annulée.');
    }
    const totalQty = loading.quantite;
    if (totalQty != null && totalQty > 0) {
      let sum = 0;
      for (const item of items) {
        if (item.quantiteAffectee == null || item.quantiteAffectee <= 0) {
          throw HttpError(400, 'Indiquez la quantité affectée pour chaque commande.');
        }
        sum += num(item.quantiteAffectee);
      }
      if (sum > totalQty + 1e-6) {
        throw HttpError(
          400,
          `Quantité totale affectée (${sum}) dépasse la quantité du bon (${totalQty}).`,
        );
      }
    }
  }
  await query(`DELETE FROM supplier_loading_assignments WHERE "loadingId" = $1`, [id]);
  for (const item of items) {
    await query(
      `INSERT INTO supplier_loading_assignments (id, "loadingId", "clientOrderId", "quantiteAffectee", notes)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        id,
        item.clientOrderId,
        item.quantiteAffectee != null ? num(item.quantiteAffectee) : null,
        item.notes || null,
      ],
    );
  }
  const mid = await getLoading(id);
  const next = await computeStatut(mid, mid.assignments);
  await query(`UPDATE supplier_loadings SET statut = $2 WHERE id = $1`, [id, next]);
  const after = await getLoading(id);
  await audit('supplier-loadings', 'UPDATE', id, 'Affectations bon', loading, after, actor);
  return after;
}

module.exports = {
  listLoadings,
  getLoading,
  createLoading,
  updateLoading,
  deleteLoading,
  setAssignments,
};
