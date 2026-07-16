'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../db.cjs');

function mapTruck(row) {
  if (!row) return null;
  return {
    id: row.id,
    immatriculation: row.immatriculation,
    nom: row.nom ?? undefined,
    modele: row.modele,
    type: row.type,
    sousType: row.sousType ?? undefined,
    remorqueImmatriculation: row.remorqueImmatriculation ?? undefined,
    statut: row.statut,
    dateMiseEnCirculation:
      row.dateMiseEnCirculation instanceof Date
        ? row.dateMiseEnCirculation.toISOString().slice(0, 10)
        : String(row.dateMiseEnCirculation).slice(0, 10),
    photo: row.photo ?? undefined,
    proprietaireId: row.proprietaireId ?? undefined,
    chauffeurId: row.chauffeurId ?? undefined,
  };
}

async function listTrucks() {
  const { rows } = await query(
    `SELECT * FROM trucks ORDER BY immatriculation ASC`,
  );
  return rows.map(mapTruck);
}

async function getTruck(id) {
  const { rows } = await query(`SELECT * FROM trucks WHERE id = $1`, [id]);
  return mapTruck(rows[0]);
}

function normalizeImmat(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

async function createTruck(body) {
  const id = randomUUID();
  const type = body.type;
  let immatriculation = normalizeImmat(body.immatriculation);
  const remorqueImmatriculation = normalizeImmat(body.remorqueImmatriculation) || null;
  let sousType = body.sousType || null;

  if (type === 'tracteur') {
    sousType = sousType || (remorqueImmatriculation ? 'tracteur_jumele' : 'tracteur_seul');
    if (sousType === 'tracteur_jumele' && remorqueImmatriculation) {
      const suffix = `-${remorqueImmatriculation}`;
      if (!immatriculation.endsWith(suffix)) immatriculation = `${immatriculation}-${remorqueImmatriculation}`;
    }
  } else {
    sousType = 'remorque_seule';
  }

  await query(
    `INSERT INTO trucks (
      id, immatriculation, nom, modele, type, "sousType", "remorqueImmatriculation",
      statut, "dateMiseEnCirculation", photo, "proprietaireId", "chauffeurId"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      immatriculation,
      body.nom?.trim() || null,
      body.modele,
      type,
      sousType,
      type === 'tracteur' && sousType === 'tracteur_jumele' ? remorqueImmatriculation : null,
      body.statut || 'actif',
      body.dateMiseEnCirculation,
      body.photo || null,
      body.proprietaireId || null,
      body.chauffeurId || null,
    ],
  );
  return getTruck(id);
}

async function updateTruck(id, body) {
  const current = await getTruck(id);
  if (!current) return null;

  const merged = { ...current, ...body };
  const type = merged.type;
  let immatriculation = normalizeImmat(merged.immatriculation);
  const remorqueImmatriculation = normalizeImmat(merged.remorqueImmatriculation) || null;
  let sousType = merged.sousType || null;

  if (type === 'tracteur') {
    sousType = sousType || (remorqueImmatriculation ? 'tracteur_jumele' : 'tracteur_seul');
    if (sousType === 'tracteur_jumele' && remorqueImmatriculation) {
      const suffix = `-${remorqueImmatriculation}`;
      if (!immatriculation.endsWith(suffix)) immatriculation = `${immatriculation}-${remorqueImmatriculation}`;
    }
  } else {
    sousType = 'remorque_seule';
  }

  await query(
    `UPDATE trucks SET
      immatriculation = $2, nom = $3, modele = $4, type = $5, "sousType" = $6,
      "remorqueImmatriculation" = $7, statut = $8, "dateMiseEnCirculation" = $9,
      photo = $10, "proprietaireId" = $11, "chauffeurId" = $12
     WHERE id = $1`,
    [
      id,
      immatriculation,
      merged.nom?.trim() || null,
      merged.modele,
      type,
      sousType,
      type === 'tracteur' && sousType === 'tracteur_jumele' ? remorqueImmatriculation : null,
      merged.statut,
      merged.dateMiseEnCirculation,
      merged.photo || null,
      merged.proprietaireId || null,
      merged.chauffeurId || null,
    ],
  );
  return getTruck(id);
}

async function deleteTruck(id) {
  const res = await query(`DELETE FROM trucks WHERE id = $1`, [id]);
  return res.rowCount > 0;
}

module.exports = {
  listTrucks,
  getTruck,
  createTruck,
  updateTruck,
  deleteTruck,
};
