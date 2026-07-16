'use strict';

const { query } = require('../db.cjs');

function mapTp(row) {
  if (!row) return null;
  return {
    id: row.id,
    nom: row.nom,
    telephone: row.telephone ?? undefined,
    email: row.email ?? undefined,
    adresse: row.adresse ?? undefined,
    type: row.type,
    notes: row.notes ?? undefined,
    plafondCredit: row.plafondCredit != null ? Number(row.plafondCredit) : undefined,
    sexe: row.sexe ?? undefined,
    segmentClient: row.segmentClient ?? undefined,
    ville: row.ville ?? undefined,
    dateNaissance: row.dateNaissance
      ? String(row.dateNaissance).slice(0, 10)
      : undefined,
  };
}

async function listThirdParties(type) {
  if (type) {
    const { rows } = await query(
      `SELECT * FROM third_parties WHERE type = $1 ORDER BY nom ASC`,
      [type],
    );
    return rows.map(mapTp);
  }
  const { rows } = await query(`SELECT * FROM third_parties ORDER BY nom ASC`);
  return rows.map(mapTp);
}

async function getThirdParty(id) {
  const { rows } = await query(`SELECT * FROM third_parties WHERE id = $1`, [id]);
  return mapTp(rows[0]);
}

module.exports = { listThirdParties, getThirdParty };
