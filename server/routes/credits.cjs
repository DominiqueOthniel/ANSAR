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

async function listCredits() {
  const { rows } = await query(`SELECT * FROM credits ORDER BY "dateDebut" DESC`);
  const out = [];
  for (const r of rows) {
    const c = rowToJson(r);
    c.montantTotal = num(r.montantTotal);
    c.montantRembourse = num(r.montantRembourse);
    c.tauxInteret = r.tauxInteret != null ? num(r.tauxInteret) : undefined;
    const { rows: rembs } = await query(
      `SELECT * FROM credit_remboursements WHERE "creditId" = $1 ORDER BY date ASC`,
      [c.id],
    );
    c.remboursements = rembs.map((x) => {
      const j = rowToJson(x);
      j.montant = num(x.montant);
      return j;
    });
    out.push(c);
  }
  return out;
}

async function getCredit(id) {
  const all = await listCredits();
  return all.find((c) => c.id === id) || null;
}

async function createCredit(body, actor) {
  const id = randomUUID();
  const type = body.type;
  await query(
    `INSERT INTO credits (
      id, type, intitule, preteur, "montantTotal", "montantRembourse", "tauxInteret",
      "dateDebut", "dateEcheance", statut, notes, "clientTierId"
    ) VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      type,
      body.intitule,
      body.preteur,
      num(body.montantTotal),
      body.tauxInteret != null ? num(body.tauxInteret) : null,
      dateOnly(body.dateDebut),
      dateOnly(body.dateEcheance),
      body.statut || 'en_cours',
      body.notes || null,
      type === 'pret_accorde' ? body.clientTierId || null : null,
    ],
  );
  const row = await getCredit(id);
  await audit('credits', 'CREATE', id, `Création crédit ${body.intitule}`, null, row, actor);
  return row;
}

async function updateCredit(id, body, actor) {
  const before = await getCredit(id);
  if (!before) throw HttpError(404, 'Crédit introuvable');
  const type = body.type ?? before.type;
  await query(
    `UPDATE credits SET
      type = COALESCE($2, type),
      intitule = COALESCE($3, intitule),
      preteur = COALESCE($4, preteur),
      "montantTotal" = COALESCE($5, "montantTotal"),
      "tauxInteret" = COALESCE($6, "tauxInteret"),
      "dateDebut" = COALESCE($7, "dateDebut"),
      "dateEcheance" = COALESCE($8, "dateEcheance"),
      statut = COALESCE($9, statut),
      notes = COALESCE($10, notes),
      "clientTierId" = $11
     WHERE id = $1`,
    [
      id,
      body.type ?? null,
      body.intitule ?? null,
      body.preteur ?? null,
      body.montantTotal !== undefined ? num(body.montantTotal) : null,
      body.tauxInteret !== undefined ? num(body.tauxInteret) : null,
      body.dateDebut !== undefined ? dateOnly(body.dateDebut) : null,
      body.dateEcheance !== undefined ? dateOnly(body.dateEcheance) : null,
      body.statut ?? null,
      body.notes !== undefined ? body.notes : null,
      type === 'emprunt' ? null : body.clientTierId !== undefined ? body.clientTierId : before.clientTierId || null,
    ],
  );
  const after = await getCredit(id);
  await audit('credits', 'UPDATE', id, 'Modification crédit', before, after, actor);
  return after;
}

async function deleteCredit(id, actor) {
  const before = await getCredit(id);
  if (!before) throw HttpError(404, 'Crédit introuvable');
  await query(`DELETE FROM credit_remboursements WHERE "creditId" = $1`, [id]);
  await query(`DELETE FROM credits WHERE id = $1`, [id]);
  await audit('credits', 'DELETE', id, 'Suppression crédit', before, null, actor);
}

async function addRemboursement(creditId, body, actor) {
  const credit = await getCredit(creditId);
  if (!credit) throw HttpError(404, 'Crédit introuvable');
  const taux = num(credit.tauxInteret);
  const due = credit.montantTotal * (1 + taux / 100);
  const reste = due - credit.montantRembourse;
  const montant = num(body.montant);
  if (montant > reste + 0.01) {
    throw HttpError(400, 'Le remboursement dépasse le reste dû.');
  }
  const id = randomUUID();
  await query(
    `INSERT INTO credit_remboursements (id, "creditId", date, montant, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, creditId, dateOnly(body.date), montant, body.note || null],
  );
  const newRemb = credit.montantRembourse + montant;
  const statut = newRemb >= due - 0.01 ? 'solde' : 'en_cours';
  await query(
    `UPDATE credits SET "montantRembourse" = $2, statut = $3 WHERE id = $1`,
    [creditId, newRemb, statut],
  );
  const after = await getCredit(creditId);
  await audit('credits', 'REMBOURSEMENT', creditId, `Remboursement ${montant}`, credit, after, actor);
  return after;
}

module.exports = {
  listCredits,
  getCredit,
  createCredit,
  updateCredit,
  deleteCredit,
  addRemboursement,
};
