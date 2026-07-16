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

function isCredit(type) {
  return type === 'depot' || type === 'virement';
}

function delta(type, montant) {
  const m = num(montant);
  return isCredit(type) ? m : -m;
}

async function recalculateAccount(compteId) {
  const { rows: accs } = await query(`SELECT * FROM bank_accounts WHERE id = $1`, [compteId]);
  if (!accs[0]) return;
  const initial = num(accs[0].soldeInitial);
  const { rows: txs } = await query(
    `SELECT type, montant FROM bank_transactions WHERE "compteId" = $1`,
    [compteId],
  );
  let solde = initial;
  for (const t of txs) solde += delta(t.type, t.montant);
  await query(`UPDATE bank_accounts SET "soldeActuel" = $2 WHERE id = $1`, [compteId, solde]);
  return solde;
}

function mapAcc(row) {
  if (!row) return null;
  const j = rowToJson(row);
  j.soldeInitial = num(row.soldeInitial);
  j.soldeActuel = num(row.soldeActuel);
  return j;
}

function mapTx(row) {
  if (!row) return null;
  const j = rowToJson(row);
  j.montant = num(row.montant);
  return j;
}

async function listAccounts() {
  const { rows } = await query(`SELECT * FROM bank_accounts ORDER BY nom ASC`);
  return rows.map(mapAcc);
}

async function getAccount(id) {
  const { rows } = await query(`SELECT * FROM bank_accounts WHERE id = $1`, [id]);
  return mapAcc(rows[0]);
}

async function createAccount(body, actor) {
  const id = randomUUID();
  const soldeInitial = num(body.soldeInitial);
  await query(
    `INSERT INTO bank_accounts (
      id, nom, "numeroCompte", banque, type, "soldeInitial", "soldeActuel",
      devise, iban, swift, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10)`,
    [
      id,
      body.nom,
      body.numeroCompte,
      body.banque,
      body.type,
      soldeInitial,
      body.devise || 'FCFA',
      body.iban || null,
      body.swift || null,
      body.notes || null,
    ],
  );
  const row = await getAccount(id);
  await audit('bank', 'CREATE', id, `Création compte ${body.nom}`, null, row, actor);
  return row;
}

async function updateAccount(id, body, actor) {
  const before = await getAccount(id);
  if (!before) throw HttpError(404, 'Compte introuvable');
  await query(
    `UPDATE bank_accounts SET
      nom = COALESCE($2, nom),
      "numeroCompte" = COALESCE($3, "numeroCompte"),
      banque = COALESCE($4, banque),
      type = COALESCE($5, type),
      "soldeInitial" = COALESCE($6, "soldeInitial"),
      devise = COALESCE($7, devise),
      iban = COALESCE($8, iban),
      swift = COALESCE($9, swift),
      notes = COALESCE($10, notes)
     WHERE id = $1`,
    [
      id,
      body.nom ?? null,
      body.numeroCompte ?? null,
      body.banque ?? null,
      body.type ?? null,
      body.soldeInitial !== undefined ? num(body.soldeInitial) : null,
      body.devise ?? null,
      body.iban !== undefined ? body.iban : null,
      body.swift !== undefined ? body.swift : null,
      body.notes !== undefined ? body.notes : null,
    ],
  );
  if (body.soldeInitial !== undefined) await recalculateAccount(id);
  const after = await getAccount(id);
  await audit('bank', 'UPDATE', id, `Modification compte`, before, after, actor);
  return after;
}

async function deleteAccount(id, actor) {
  const before = await getAccount(id);
  if (!before) throw HttpError(404, 'Compte introuvable');
  await query(`DELETE FROM bank_accounts WHERE id = $1`, [id]);
  await audit('bank', 'DELETE', id, `Suppression compte`, before, null, actor);
}

async function listTransactions(compteId) {
  if (compteId) {
    const { rows } = await query(
      `SELECT * FROM bank_transactions WHERE "compteId" = $1 ORDER BY date DESC`,
      [compteId],
    );
    return rows.map(mapTx);
  }
  const { rows } = await query(`SELECT * FROM bank_transactions ORDER BY date DESC`);
  return rows.map(mapTx);
}

async function getTransaction(id) {
  const { rows } = await query(`SELECT * FROM bank_transactions WHERE id = $1`, [id]);
  return mapTx(rows[0]);
}

async function createTransaction(body, actor) {
  const compteId = body.compteId;
  const acc = await getAccount(compteId);
  if (!acc) throw HttpError(400, 'Compte bancaire introuvable');
  const d = delta(body.type, body.montant);
  if (d < 0 && acc.soldeActuel + d < -0.01) {
    throw HttpError(400, 'Solde bancaire insuffisant pour cette opération.');
  }
  const id = randomUUID();
  await query(
    `INSERT INTO bank_transactions (
      id, "compteId", type, montant, date, description, reference, beneficiaire, categorie
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      compteId,
      body.type,
      num(body.montant),
      dateOnly(body.date),
      body.description,
      body.reference || null,
      body.beneficiaire || null,
      body.categorie || null,
    ],
  );
  await recalculateAccount(compteId);
  const row = await getTransaction(id);
  await audit('bank', 'CREATE', id, `Mouvement banque ${body.type}`, null, row, actor);
  return row;
}

async function updateTransaction(id, body, actor) {
  const before = await getTransaction(id);
  if (!before) throw HttpError(404, 'Transaction introuvable');
  const oldCompte = before.compteId;
  const newCompte = body.compteId ?? oldCompte;
  await query(
    `UPDATE bank_transactions SET
      "compteId" = COALESCE($2, "compteId"),
      type = COALESCE($3, type),
      montant = COALESCE($4, montant),
      date = COALESCE($5, date),
      description = COALESCE($6, description),
      reference = COALESCE($7, reference),
      beneficiaire = COALESCE($8, beneficiaire),
      categorie = COALESCE($9, categorie)
     WHERE id = $1`,
    [
      id,
      body.compteId ?? null,
      body.type ?? null,
      body.montant !== undefined ? num(body.montant) : null,
      body.date !== undefined ? dateOnly(body.date) : null,
      body.description ?? null,
      body.reference !== undefined ? body.reference : null,
      body.beneficiaire !== undefined ? body.beneficiaire : null,
      body.categorie !== undefined ? body.categorie : null,
    ],
  );
  await recalculateAccount(oldCompte);
  if (newCompte !== oldCompte) await recalculateAccount(newCompte);
  const solde = await recalculateAccount(newCompte);
  if (solde < -0.01) {
    // rollback fields
    await query(
      `UPDATE bank_transactions SET
        "compteId"=$2, type=$3, montant=$4, date=$5, description=$6,
        reference=$7, beneficiaire=$8, categorie=$9 WHERE id=$1`,
      [
        id,
        before.compteId,
        before.type,
        before.montant,
        before.date,
        before.description,
        before.reference || null,
        before.beneficiaire || null,
        before.categorie || null,
      ],
    );
    await recalculateAccount(oldCompte);
    if (newCompte !== oldCompte) await recalculateAccount(newCompte);
    throw HttpError(400, 'Solde bancaire insuffisant après modification.');
  }
  const after = await getTransaction(id);
  await audit('bank', 'UPDATE', id, 'Modification mouvement banque', before, after, actor);
  return after;
}

async function deleteTransaction(id, actor) {
  const before = await getTransaction(id);
  if (!before) throw HttpError(404, 'Transaction introuvable');
  await query(`DELETE FROM bank_transactions WHERE id = $1`, [id]);
  await recalculateAccount(before.compteId);
  await audit('bank', 'DELETE', id, 'Suppression mouvement banque', before, null, actor);
}

module.exports = {
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
