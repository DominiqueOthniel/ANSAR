'use strict';

const { query } = require('../db.cjs');

function mapDriver(row) {
  if (!row) return null;
  return {
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    telephone: row.telephone,
    cni: row.cni ?? undefined,
    numeroPermis: row.numeroPermis ?? undefined,
    photo: row.photo ?? undefined,
  };
}

async function listDrivers() {
  const { rows } = await query(`SELECT * FROM drivers ORDER BY nom ASC, prenom ASC`);
  return rows.map(mapDriver);
}

async function getDriver(id) {
  const { rows } = await query(`SELECT * FROM drivers WHERE id = $1`, [id]);
  return mapDriver(rows[0]);
}

module.exports = { listDrivers, getDriver };
