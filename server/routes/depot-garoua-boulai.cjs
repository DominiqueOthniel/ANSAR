'use strict';

const { HttpError, dateOnly, num, audit, rowToJson, randomUUID, query } = require('../lib.cjs');

const TABLE = 'depot_garoua_boulai_movements';
const MODULE = 'depot-garoua-boulai';

function mapRow(row) {
  if (!row) return null;
  const j = rowToJson(row);
  j.quantite = num(j.quantite);
  j.stockFinal = num(j.stockFinal);
  return j;
}

async function orderedRows() {
  const { rows } = await query(
    `SELECT * FROM ${TABLE} ORDER BY date ASC, created_at ASC, id ASC`,
  );
  return rows;
}

async function recalculateStockFinals(actor) {
  const rows = await orderedRows();
  let stock = 0;
  for (const row of rows) {
    const q = num(row.quantite);
    stock += row.type === 'entree' ? q : -q;
    if (stock < -1e-9) {
      throw HttpError(400, 'Stock dépôt insuffisant pour ce retrait.');
    }
    await query(`UPDATE ${TABLE} SET "stockFinal" = $1 WHERE id = $2`, [stock, row.id]);
  }
  return stock;
}

async function currentStock() {
  const { rows } = await query(
    `SELECT "stockFinal" FROM ${TABLE} ORDER BY date DESC, created_at DESC, id DESC LIMIT 1`,
  );
  if (!rows[0]) return 0;
  return num(rows[0].stockFinal);
}

function validatePayload(body, partial) {
  if (!partial || body.date !== undefined) {
    if (!body.date?.trim()) throw HttpError(400, 'Date requise.');
  }
  if (!partial || body.type !== undefined) {
    if (body.type !== 'entree' && body.type !== 'retrait') {
      throw HttpError(400, 'Type invalide (entrée ou retrait).');
    }
  }
  if (!partial || body.quantite !== undefined) {
    const q = num(body.quantite);
    if (!Number.isFinite(q) || q <= 0) throw HttpError(400, 'Quantité invalide.');
  }
}

async function listMovements() {
  const { rows } = await query(
    `SELECT * FROM ${TABLE} ORDER BY date DESC, created_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

async function getMovement(id) {
  const { rows } = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

async function createMovement(body, actor) {
  validatePayload(body, false);
  const id = randomUUID();
  const stock = await currentStock();
  const q = num(body.quantite);
  if (body.type === 'retrait' && q > stock + 1e-9) {
    throw HttpError(
      400,
      `Stock insuffisant au dépôt (${stock.toLocaleString('fr-FR')} disponible).`,
    );
  }

  await query(
    `INSERT INTO ${TABLE}
      (id, date, "truckId", "camionImmatriculation", type, quantite, "stockFinal", notes, utilisateur)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      dateOnly(body.date),
      body.truckId || null,
      body.camionImmatriculation?.trim() || null,
      body.type,
      q,
      0,
      body.notes?.trim() || null,
      body.utilisateur?.trim() || actor?.login || 'Système',
    ],
  );

  await recalculateStockFinals(actor);
  const row = await getMovement(id);
  await audit(MODULE, 'CREATE', id, 'Mouvement dépôt Garoua-Boulai', null, row, actor);
  return row;
}

async function updateMovement(id, body, actor) {
  const prev = await getMovement(id);
  if (!prev) throw HttpError(404, 'Mouvement introuvable.');
  validatePayload(body, true);

  await query(
    `UPDATE ${TABLE} SET
      date = COALESCE($2, date),
      "truckId" = COALESCE($3, "truckId"),
      "camionImmatriculation" = COALESCE($4, "camionImmatriculation"),
      type = COALESCE($5, type),
      quantite = COALESCE($6, quantite),
      notes = COALESCE($7, notes)
     WHERE id = $1`,
    [
      id,
      body.date !== undefined ? dateOnly(body.date) : null,
      body.truckId !== undefined ? body.truckId || null : null,
      body.camionImmatriculation !== undefined
        ? body.camionImmatriculation?.trim() || null
        : null,
      body.type ?? null,
      body.quantite !== undefined ? num(body.quantite) : null,
      body.notes !== undefined ? body.notes?.trim() || null : null,
    ],
  );

  await recalculateStockFinals(actor);
  const row = await getMovement(id);
  await audit(MODULE, 'UPDATE', id, 'Mouvement dépôt Garoua-Boulai', prev, row, actor);
  return row;
}

async function deleteMovement(id, actor) {
  const prev = await getMovement(id);
  if (!prev) throw HttpError(404, 'Mouvement introuvable.');
  await query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
  await recalculateStockFinals(actor);
  await audit(MODULE, 'DELETE', id, 'Mouvement dépôt Garoua-Boulai', prev, null, actor);
}

module.exports = {
  listMovements,
  getMovement,
  createMovement,
  updateMovement,
  deleteMovement,
  currentStock,
};
