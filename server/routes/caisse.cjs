'use strict';

const {
  HttpError,
  dateOnly,
  num,
  actorFrom,
  audit,
  rowToJson,
  rowsToJson,
  getById,
  randomUUID,
  query,
} = require('../lib.cjs');

async function ensureConfig() {
  await query(
    `INSERT INTO caisse_config (id, "soldeInitial") VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await query(`SELECT * FROM caisse_config WHERE id = 1`);
  return rows[0];
}

async function balanceExcluding(excludeId) {
  const cfg = await ensureConfig();
  let solde = num(cfg.soldeInitial);
  const { rows } = await query(`SELECT id, type, montant FROM caisse_transactions`);
  for (const t of rows) {
    if (excludeId && t.id === excludeId) continue;
    const m = num(t.montant);
    solde += t.type === 'entree' ? m : -m;
  }
  return solde;
}

async function assertSortie(montant, excludeId) {
  if (!Number.isFinite(montant) || montant <= 0) return;
  const dispo = await balanceExcluding(excludeId);
  if (montant > dispo) {
    throw HttpError(
      400,
      `Solde caisse insuffisant. Solde disponible : ${Math.max(0, dispo).toLocaleString('fr-FR')} FCFA, sortie demandée : ${montant.toLocaleString('fr-FR')} FCFA.`,
    );
  }
}

async function assertSortieByRef(montant, excludeReference) {
  if (!excludeReference) return assertSortie(montant);
  const { rows } = await query(`SELECT id FROM caisse_transactions WHERE reference = $1`, [
    excludeReference,
  ]);
  return assertSortie(montant, rows[0]?.id);
}

function mapTx(row) {
  if (!row) return null;
  const j = rowToJson(row);
  j.montant = num(row.montant);
  j.exclutRevenu = Boolean(row.exclutRevenu);
  return j;
}

async function getConfig() {
  const c = await ensureConfig();
  return { id: 1, soldeInitial: num(c.soldeInitial) };
}

async function updateConfig(body) {
  await ensureConfig();
  await query(`UPDATE caisse_config SET "soldeInitial" = $1, "updatedAt" = NOW() WHERE id = 1`, [
    num(body.soldeInitial),
  ]);
  return getConfig();
}

async function getBalance() {
  const cfg = await getConfig();
  const soldeActuel = await balanceExcluding();
  return { soldeInitial: cfg.soldeInitial, soldeActuel };
}

async function listTx() {
  const { rows } = await query(
    `SELECT * FROM caisse_transactions ORDER BY date DESC, "createdAt" DESC NULLS LAST`,
  );
  return rows.map(mapTx);
}

async function createTx(body, actor) {
  if (body.type === 'sortie') await assertSortie(num(body.montant));
  const id = body.id?.trim() || randomUUID();
  await query(
    `INSERT INTO caisse_transactions (
      id, type, montant, date, description, utilisateur, categorie, reference,
      "compteBanqueId", "bankTransactionId", "exclutRevenu", "createdAt"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
    [
      id,
      body.type,
      num(body.montant),
      dateOnly(body.date),
      body.description,
      body.utilisateur?.trim() || actor?.login || 'Système',
      body.categorie || null,
      body.reference || null,
      body.compteBanqueId || null,
      body.bankTransactionId || null,
      Boolean(body.exclutRevenu),
    ],
  );
  const row = mapTx((await query(`SELECT * FROM caisse_transactions WHERE id = $1`, [id])).rows[0]);
  await audit('caisse', 'CREATE', id, `Création mouvement caisse ${body.type}`, null, row, actor);
  return row;
}

async function updateTx(id, body, actor) {
  const { rows } = await query(`SELECT * FROM caisse_transactions WHERE id = $1`, [id]);
  if (!rows[0]) throw HttpError(404, `Mouvement caisse ${id} introuvable`);
  const before = mapTx(rows[0]);
  const newType = body.type ?? before.type;
  const newMontant = body.montant !== undefined ? num(body.montant) : before.montant;
  if (newType === 'sortie') await assertSortie(newMontant, id);
  await query(
    `UPDATE caisse_transactions SET
      type = COALESCE($2, type),
      montant = COALESCE($3, montant),
      date = COALESCE($4, date),
      description = COALESCE($5, description),
      utilisateur = COALESCE($6, utilisateur),
      categorie = COALESCE($7, categorie),
      reference = COALESCE($8, reference),
      "compteBanqueId" = COALESCE($9, "compteBanqueId"),
      "bankTransactionId" = COALESCE($10, "bankTransactionId"),
      "exclutRevenu" = COALESCE($11, "exclutRevenu")
     WHERE id = $1`,
    [
      id,
      body.type ?? null,
      body.montant !== undefined ? num(body.montant) : null,
      body.date !== undefined ? dateOnly(body.date) : null,
      body.description ?? null,
      body.utilisateur !== undefined
        ? body.utilisateur?.trim() || actor?.login || 'Système'
        : null,
      body.categorie !== undefined ? body.categorie : null,
      body.reference !== undefined ? body.reference : null,
      body.compteBanqueId !== undefined ? body.compteBanqueId : null,
      body.bankTransactionId !== undefined ? body.bankTransactionId : null,
      body.exclutRevenu !== undefined ? Boolean(body.exclutRevenu) : null,
    ],
  );
  const after = mapTx((await query(`SELECT * FROM caisse_transactions WHERE id = $1`, [id])).rows[0]);
  await audit('caisse', 'UPDATE', id, `Modification mouvement caisse`, before, after, actor);
  return after;
}

async function deleteTx(id, actor) {
  const { rows } = await query(`SELECT * FROM caisse_transactions WHERE id = $1`, [id]);
  if (!rows[0]) throw HttpError(404, `Mouvement caisse ${id} introuvable`);
  await query(`DELETE FROM caisse_transactions WHERE id = $1`, [id]);
  await audit('caisse', 'DELETE', id, 'Suppression mouvement caisse', mapTx(rows[0]), null, actor);
}

async function upsertByReference(reference, body, actor) {
  const { rows } = await query(`SELECT id FROM caisse_transactions WHERE reference = $1`, [
    reference,
  ]);
  if (rows[0]) {
    return updateTx(rows[0].id, { ...body, reference }, actor);
  }
  return createTx({ ...body, reference }, actor);
}

async function removeByReference(reference) {
  await query(`DELETE FROM caisse_transactions WHERE reference = $1`, [reference]);
}

module.exports = {
  getConfig,
  updateConfig,
  getBalance,
  listTx,
  createTx,
  updateTx,
  deleteTx,
  upsertByReference,
  removeByReference,
  assertSortieByRef,
  assertSortie,
};
