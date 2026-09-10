'use strict';

const { HttpError, dateOnly, num, audit, rowToJson, randomUUID, query } = require('../lib.cjs');

const TABLE = 'tjk_operations';
const MODULE = 'tjk-operations';

let schemaReady = false;

function normalizeImmat(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, '').toUpperCase().trim();
  return s || null;
}

function mapRow(row) {
  if (!row) return null;
  const j = rowToJson(row);
  j.quantite = num(j.quantite);
  if (j.created_at && !j.createdAt) j.createdAt = j.created_at;
  return j;
}

async function ensureSchema() {
  if (schemaReady) return;
  await query(`
    ALTER TABLE ${TABLE}
      ADD COLUMN IF NOT EXISTS "supplierLoadingId" UUID
  `);
  schemaReady = true;
}

function validatePayload(body, partial) {
  if (!partial || body.date !== undefined) {
    if (!body.date?.trim()) throw HttpError(400, 'Date requise.');
  }
  if (!partial) {
    const hasClient =
      Boolean(body.clientId?.toString?.().trim?.() || body.clientId) ||
      Boolean(body.clientNom?.trim());
    if (!hasClient) {
      throw HttpError(400, 'Indiquez un client (fiche ou nom libre).');
    }
  } else if (body.clientId !== undefined || body.clientNom !== undefined) {
    const clientId =
      body.clientId !== undefined ? body.clientId || null : undefined;
    const clientNom =
      body.clientNom !== undefined ? body.clientNom?.trim() || '' : undefined;
    if (clientId !== undefined && clientNom !== undefined) {
      if (!clientId && !clientNom) {
        throw HttpError(400, 'Indiquez un client (fiche ou nom libre).');
      }
    }
  }
  if (!partial || body.quantite !== undefined) {
    const q = num(body.quantite);
    if (!Number.isFinite(q) || q < 0) throw HttpError(400, 'Quantité invalide.');
  }
}

async function listOperations() {
  await ensureSchema();
  const { rows } = await query(
    `SELECT * FROM ${TABLE} ORDER BY date DESC, created_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

async function getOperation(id) {
  await ensureSchema();
  const { rows } = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

async function createOperation(body, actor) {
  await ensureSchema();
  validatePayload(body, false);
  const id = randomUUID();
  const clientNom = body.clientNom?.trim() || null;
  const q = num(body.quantite);

  await query(
    `INSERT INTO ${TABLE}
      (id, date, "clientId", "clientNom", quantite, unite, qualite, destination,
       "camionNom", "camionImmatriculation", "referenceAtc", "supplierLoadingId", notes, utilisateur)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      dateOnly(body.date),
      body.clientId || null,
      clientNom,
      q,
      body.unite?.trim() || null,
      body.qualite?.trim() || null,
      body.destination?.trim() || null,
      body.camionNom?.trim() || null,
      normalizeImmat(body.camionImmatriculation),
      body.referenceAtc?.trim() || null,
      body.supplierLoadingId || null,
      body.notes?.trim() || null,
      body.utilisateur?.trim() || actor?.login || 'Système',
    ],
  );

  const row = await getOperation(id);
  await audit(MODULE, 'CREATE', id, 'Opération TJK', null, row, actor);
  return row;
}

async function updateOperation(id, body, actor) {
  await ensureSchema();
  const prev = await getOperation(id);
  if (!prev) throw HttpError(404, 'Opération introuvable.');
  validatePayload(body, true);

  const nextClientId =
    body.clientId !== undefined ? body.clientId || null : prev.clientId || null;
  const nextClientNom =
    body.clientNom !== undefined
      ? body.clientNom?.trim() || null
      : prev.clientNom || null;
  if (!nextClientId && !nextClientNom) {
    throw HttpError(400, 'Indiquez un client (fiche ou nom libre).');
  }

  await query(
    `UPDATE ${TABLE} SET
      date = COALESCE($2, date),
      "clientId" = $3,
      "clientNom" = $4,
      quantite = COALESCE($5, quantite),
      unite = COALESCE($6, unite),
      qualite = COALESCE($7, qualite),
      destination = COALESCE($8, destination),
      "camionNom" = COALESCE($9, "camionNom"),
      "camionImmatriculation" = COALESCE($10, "camionImmatriculation"),
      "referenceAtc" = COALESCE($11, "referenceAtc"),
      "supplierLoadingId" = $12,
      notes = COALESCE($13, notes)
     WHERE id = $1`,
    [
      id,
      body.date !== undefined ? dateOnly(body.date) : null,
      body.clientId !== undefined ? body.clientId || null : prev.clientId || null,
      body.clientNom !== undefined
        ? body.clientNom?.trim() || null
        : prev.clientNom || null,
      body.quantite !== undefined ? num(body.quantite) : null,
      body.unite !== undefined ? body.unite?.trim() || null : null,
      body.qualite !== undefined ? body.qualite?.trim() || null : null,
      body.destination !== undefined ? body.destination?.trim() || null : null,
      body.camionNom !== undefined ? body.camionNom?.trim() || null : null,
      body.camionImmatriculation !== undefined
        ? normalizeImmat(body.camionImmatriculation)
        : null,
      body.referenceAtc !== undefined ? body.referenceAtc?.trim() || null : null,
      body.supplierLoadingId !== undefined
        ? body.supplierLoadingId || null
        : prev.supplierLoadingId || null,
      body.notes !== undefined ? body.notes?.trim() || null : null,
    ],
  );

  const row = await getOperation(id);
  await audit(MODULE, 'UPDATE', id, 'Opération TJK', prev, row, actor);
  return row;
}

async function deleteOperation(id, actor) {
  await ensureSchema();
  const prev = await getOperation(id);
  if (!prev) throw HttpError(404, 'Opération introuvable.');
  await query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
  await audit(MODULE, 'DELETE', id, 'Opération TJK', prev, null, actor);
}

module.exports = {
  listOperations,
  getOperation,
  createOperation,
  updateOperation,
  deleteOperation,
};
