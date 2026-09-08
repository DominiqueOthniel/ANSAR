'use strict';

const { HttpError, dateOnly, num, audit, rowToJson, randomUUID, query } = require('../lib.cjs');

const TABLE = 'camrail_operations';
const MODULE = 'camrail-operations';

function normalizeImmat(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, '').toUpperCase().trim();
  return s || null;
}

function normalizeCamionNom(v) {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return s || null;
}

function normalizeWagon(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function optionalDate(v) {
  if (v == null || v === '') return null;
  return dateOnly(v);
}

function optionalNum(v) {
  if (v == null || v === '') return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row) {
  if (!row) return null;
  const j = rowToJson(row);
  j.quantite = num(j.quantite);
  if (j.atComplement != null && j.atComplement !== '') {
    j.atComplement = num(j.atComplement);
  } else {
    j.atComplement = null;
  }
  if (j.created_at && !j.createdAt) j.createdAt = j.created_at;
  return j;
}

function validatePayload(body, partial) {
  if (!partial || body.date !== undefined) {
    if (!body.date?.trim()) throw HttpError(400, 'Date requise.');
  }
  if (!partial || body.quantite !== undefined) {
    const q = num(body.quantite);
    if (!Number.isFinite(q) || q < 0) throw HttpError(400, 'Quantité invalide.');
  }
  if (!partial || body.atComplement !== undefined) {
    if (body.atComplement != null && body.atComplement !== '') {
      const c = num(body.atComplement);
      if (!Number.isFinite(c) || c < 0) {
        throw HttpError(400, 'Complément AT invalide.');
      }
    }
  }
}

async function listOperations() {
  const { rows } = await query(
    `SELECT * FROM ${TABLE} ORDER BY date DESC, created_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

async function getOperation(id) {
  const { rows } = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

async function createOperation(body, actor) {
  validatePayload(body, false);
  const id = randomUUID();
  const q = num(body.quantite);

  await query(
    `INSERT INTO ${TABLE}
      (id, date, "camionNom", "camionImmatriculation", quantite, "typeProduit",
       "referenceAtc", "atComplement", destinataire, "dateChargement",
       "dateLivraison", "numeroWagon", commentaires, transporteur, notes, utilisateur)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id,
      dateOnly(body.date),
      normalizeCamionNom(body.camionNom),
      normalizeImmat(body.camionImmatriculation),
      q,
      body.typeProduit?.trim() || null,
      body.referenceAtc?.trim() || null,
      optionalNum(body.atComplement),
      body.destinataire?.trim() || null,
      optionalDate(body.dateChargement),
      optionalDate(body.dateLivraison),
      normalizeWagon(body.numeroWagon),
      body.commentaires?.trim() || null,
      body.transporteur?.trim() || null,
      body.notes?.trim() || null,
      body.utilisateur?.trim() || actor?.login || 'Système',
    ],
  );

  const row = await getOperation(id);
  await audit(MODULE, 'CREATE', id, 'Opération Camrail', null, row, actor);
  return row;
}

async function updateOperation(id, body, actor) {
  const prev = await getOperation(id);
  if (!prev) throw HttpError(404, 'Opération introuvable.');
  validatePayload(body, true);

  await query(
    `UPDATE ${TABLE} SET
      date = COALESCE($2, date),
      "camionNom" = COALESCE($3, "camionNom"),
      "camionImmatriculation" = COALESCE($4, "camionImmatriculation"),
      quantite = COALESCE($5, quantite),
      "typeProduit" = COALESCE($6, "typeProduit"),
      "referenceAtc" = COALESCE($7, "referenceAtc"),
      "atComplement" = COALESCE($8, "atComplement"),
      destinataire = COALESCE($9, destinataire),
      "dateChargement" = COALESCE($10, "dateChargement"),
      "dateLivraison" = COALESCE($11, "dateLivraison"),
      "numeroWagon" = COALESCE($12, "numeroWagon"),
      commentaires = COALESCE($13, commentaires),
      transporteur = COALESCE($14, transporteur),
      notes = COALESCE($15, notes)
     WHERE id = $1`,
    [
      id,
      body.date !== undefined ? dateOnly(body.date) : null,
      body.camionNom !== undefined ? normalizeCamionNom(body.camionNom) : null,
      body.camionImmatriculation !== undefined
        ? normalizeImmat(body.camionImmatriculation)
        : null,
      body.quantite !== undefined ? num(body.quantite) : null,
      body.typeProduit !== undefined ? body.typeProduit?.trim() || null : null,
      body.referenceAtc !== undefined ? body.referenceAtc?.trim() || null : null,
      body.atComplement !== undefined ? optionalNum(body.atComplement) : null,
      body.destinataire !== undefined ? body.destinataire?.trim() || null : null,
      body.dateChargement !== undefined ? optionalDate(body.dateChargement) : null,
      body.dateLivraison !== undefined ? optionalDate(body.dateLivraison) : null,
      body.numeroWagon !== undefined ? normalizeWagon(body.numeroWagon) : null,
      body.commentaires !== undefined ? body.commentaires?.trim() || null : null,
      body.transporteur !== undefined ? body.transporteur?.trim() || null : null,
      body.notes !== undefined ? body.notes?.trim() || null : null,
    ],
  );

  const row = await getOperation(id);
  await audit(MODULE, 'UPDATE', id, 'Opération Camrail', prev, row, actor);
  return row;
}

async function deleteOperation(id, actor) {
  const prev = await getOperation(id);
  if (!prev) throw HttpError(404, 'Opération introuvable.');
  await query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
  await audit(MODULE, 'DELETE', id, 'Opération Camrail', prev, null, actor);
}

module.exports = {
  listOperations,
  getOperation,
  createOperation,
  updateOperation,
  deleteOperation,
};
