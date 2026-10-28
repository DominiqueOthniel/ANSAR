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
  if (j.qtes != null) j.qtes = num(j.qtes);
  if (j.tonnage != null) j.tonnage = num(j.tonnage);
  if (j.prixTrans != null) j.prixTrans = num(j.prixTrans);
  if (j.paiement != null) j.paiement = num(j.paiement);
  if (j.soldeAnterieur != null) j.soldeAnterieur = num(j.soldeAnterieur);
  if (j.nombreCamions != null) j.nombreCamions = num(j.nombreCamions);
  if (j.tonnageTotal != null) j.tonnageTotal = num(j.tonnageTotal);
  if (j.qtfs != null) j.qtfs = num(j.qtfs);
  if (j.resteAPayer != null) j.resteAPayer = num(j.resteAPayer);
  if (j.prixTransport != null) j.prixTransport = num(j.prixTransport);
  if (j.totalTransport != null) j.totalTransport = num(j.totalTransport);
  if (j.prixVoyage != null) j.prixVoyage = num(j.prixVoyage);
  if (j.totalPalemarr != null) j.totalPalemarr = num(j.totalPalemarr);
  if (j.created_at && !j.createdAt) j.createdAt = j.created_at;
  return j;
}

function optionalNum(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = num(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeClientShares(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!Array.isArray(raw)) throw HttpError(400, 'clientShares invalide.');
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const clientNom = item.clientNom != null ? String(item.clientNom).trim() : '';
    const clientId = item.clientId ? String(item.clientId) : null;
    if (!clientId && !clientNom) continue;
    const quantite = optionalNum(item.quantite);
    if (quantite == null || quantite <= 0) {
      throw HttpError(400, 'Chaque part client doit avoir une quantité positive.');
    }
    const montant = optionalNum(item.montant);
    if (montant != null && montant < 0) {
      throw HttpError(400, 'Montant de part client invalide.');
    }
    out.push({
      id: item.id ? String(item.id) : randomUUID(),
      clientId,
      clientNom: clientNom || null,
      quantite,
      montant: montant != null ? montant : null,
    });
  }
  return out;
}

function hasAnyClient(body) {
  const shares = Array.isArray(body.clientShares) ? body.clientShares : null;
  if (shares && shares.some((s) => s && (s.clientId || (s.clientNom && String(s.clientNom).trim())))) {
    return true;
  }
  return (
    Boolean(body.clientId?.toString?.().trim?.() || body.clientId) ||
    Boolean(body.clientNom?.trim())
  );
}

async function ensureSchema() {
  if (schemaReady) return;
  await query(`
    ALTER TABLE ${TABLE}
      ADD COLUMN IF NOT EXISTS "supplierLoadingId" UUID,
      ADD COLUMN IF NOT EXISTS qtes NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS tonnage NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS "telChauffeur" VARCHAR(40),
      ADD COLUMN IF NOT EXISTS "prixTrans" NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS paiement NUMERIC(14, 2),
      ADD COLUMN IF NOT EXISTS "clientShares" JSONB
  `);
  schemaReady = true;
}

function validatePayload(body, partial) {
  if (!partial || body.date !== undefined) {
    if (!body.date?.trim()) throw HttpError(400, 'Date requise.');
  }
  if (!partial) {
    if (!hasAnyClient(body)) {
      throw HttpError(400, 'Indiquez un client (fiche ou nom libre).');
    }
  } else if (
    body.clientId !== undefined ||
    body.clientNom !== undefined ||
    body.clientShares !== undefined
  ) {
    if (body.clientShares !== undefined) {
      normalizeClientShares(body.clientShares);
    }
    if (
      body.clientId !== undefined &&
      body.clientNom !== undefined &&
      body.clientShares === undefined
    ) {
      if (!body.clientId && !body.clientNom?.trim()) {
        throw HttpError(400, 'Indiquez un client (fiche ou nom libre).');
      }
    }
  }
  if (!partial || body.quantite !== undefined) {
    const q = num(body.quantite);
    if (!Number.isFinite(q) || q < 0) throw HttpError(400, 'Quantité invalide.');
  }
  if (body.clientShares !== undefined) {
    normalizeClientShares(body.clientShares);
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
  const clientShares = normalizeClientShares(body.clientShares) ?? null;

  await query(
    `INSERT INTO ${TABLE}
      (id, date, "clientId", "clientNom", "clientShares", quantite, unite, qualite, destination,
       "camionNom", "camionImmatriculation", "referenceAtc", "supplierLoadingId",
       qtes, tonnage, "telChauffeur", "prixTrans", paiement, notes, utilisateur,
       "soldeAnterieur", "nombreCamions", "tonnageTotal", "qtfs", "resteAPayer",
       "prixTransport", "totalTransport", "prixVoyage", "totalPalemarr")
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
    [
      id,
      dateOnly(body.date),
      body.clientId || null,
      clientNom,
      clientShares ? JSON.stringify(clientShares) : null,
      q,
      body.unite?.trim() || null,
      body.qualite?.trim() || null,
      body.destination?.trim() || null,
      body.camionNom?.trim() || null,
      normalizeImmat(body.camionImmatriculation),
      body.referenceAtc?.trim() || null,
      body.supplierLoadingId || null,
      optionalNum(body.qtes) ?? q,
      optionalNum(body.tonnage),
      body.telChauffeur?.trim() || null,
      optionalNum(body.prixTrans),
      optionalNum(body.paiement),
      body.notes?.trim() || null,
      body.utilisateur?.trim() || actor?.login || 'Système',
      num(body.soldeAnterieur) || 0,
      num(body.nombreCamions) || 0,
      num(body.tonnageTotal) || 0,
      num(body.qtfs) || 0,
      num(body.resteAPayer) || 0,
      num(body.prixTransport) || 0,
      num(body.totalTransport) || 0,
      num(body.prixVoyage) || 0,
      num(body.totalPalemarr) || 0,
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
  const nextClientShares =
    body.clientShares !== undefined
      ? normalizeClientShares(body.clientShares)
      : prev.clientShares != null
        ? prev.clientShares
        : null;
  const hasShares =
    Array.isArray(nextClientShares) && nextClientShares.length > 0;
  if (!nextClientId && !nextClientNom && !hasShares) {
    throw HttpError(400, 'Indiquez un client (fiche ou nom libre).');
  }

  const nextQtes =
    body.qtes !== undefined
      ? optionalNum(body.qtes)
      : prev.qtes != null
        ? num(prev.qtes)
        : null;
  const nextTonnage =
    body.tonnage !== undefined
      ? optionalNum(body.tonnage)
      : prev.tonnage != null
        ? num(prev.tonnage)
        : null;
  const nextTel =
    body.telChauffeur !== undefined
      ? body.telChauffeur?.trim() || null
      : prev.telChauffeur || null;
  const nextPrix =
    body.prixTrans !== undefined
      ? optionalNum(body.prixTrans)
      : prev.prixTrans != null
        ? num(prev.prixTrans)
        : null;
  const nextPaiement =
    body.paiement !== undefined
      ? optionalNum(body.paiement)
      : prev.paiement != null
        ? num(prev.paiement)
        : null;

  await query(
    `UPDATE ${TABLE} SET
      date = COALESCE($2, date),
      "clientId" = $3,
      "clientNom" = $4,
      "clientShares" = $5::jsonb,
      quantite = COALESCE($6, quantite),
      unite = COALESCE($7, unite),
      qualite = COALESCE($8, qualite),
      destination = COALESCE($9, destination),
      "camionNom" = COALESCE($10, "camionNom"),
      "camionImmatriculation" = COALESCE($11, "camionImmatriculation"),
      "referenceAtc" = COALESCE($12, "referenceAtc"),
      "supplierLoadingId" = $13,
      qtes = $14,
      tonnage = $15,
      "telChauffeur" = $16,
      "prixTrans" = $17,
      paiement = $18,
      notes = COALESCE($19, notes),
      "soldeAnterieur" = COALESCE($20, "soldeAnterieur"),
      "nombreCamions" = COALESCE($21, "nombreCamions"),
      "tonnageTotal" = COALESCE($22, "tonnageTotal"),
      "qtfs" = COALESCE($23, "qtfs"),
      "resteAPayer" = COALESCE($24, "resteAPayer"),
      "prixTransport" = COALESCE($25, "prixTransport"),
      "totalTransport" = COALESCE($26, "totalTransport"),
      "prixVoyage" = COALESCE($27, "prixVoyage"),
      "totalPalemarr" = COALESCE($28, "totalPalemarr")
     WHERE id = $1`,
    [
      id,
      body.date !== undefined ? dateOnly(body.date) : null,
      body.clientId !== undefined ? body.clientId || null : prev.clientId || null,
      body.clientNom !== undefined
        ? body.clientNom?.trim() || null
        : prev.clientNom || null,
      nextClientShares != null ? JSON.stringify(nextClientShares) : null,
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
      nextQtes,
      nextTonnage,
      nextTel,
      nextPrix,
      nextPaiement,
      body.notes !== undefined ? body.notes?.trim() || null : null,
      body.soldeAnterieur !== undefined ? num(body.soldeAnterieur) : null,
      body.nombreCamions !== undefined ? num(body.nombreCamions) : null,
      body.tonnageTotal !== undefined ? num(body.tonnageTotal) : null,
      body.qtfs !== undefined ? num(body.qtfs) : null,
      body.resteAPayer !== undefined ? num(body.resteAPayer) : null,
      body.prixTransport !== undefined ? num(body.prixTransport) : null,
      body.totalTransport !== undefined ? num(body.totalTransport) : null,
      body.prixVoyage !== undefined ? num(body.prixVoyage) : null,
      body.totalPalemarr !== undefined ? num(body.totalPalemarr) : null,
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
