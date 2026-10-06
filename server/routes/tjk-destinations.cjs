'use strict';

const { createTableApi } = require('../crud.cjs');
const { HttpError, query } = require('../lib.cjs');

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS tjk_destinations (
      id UUID PRIMARY KEY,
      libelle VARCHAR(255) NOT NULL,
      "quantiteDefaut" NUMERIC(12, 2),
      "poidsUniteKg" NUMERIC(8, 3) DEFAULT 50,
      "prixTrans" NUMERIC(14, 2),
      "prixTransport" NUMERIC(14, 2),
      "totalTransport" NUMERIC(14, 2),
      "prixVoyage" NUMERIC(14, 2),
      "totalPaiement" NUMERIC(14, 2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tjk_destinations_libelle_lower_idx
      ON tjk_destinations (LOWER(TRIM(libelle)))
  `);
  schemaReady = true;
}

function normalizeLibelle(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

const base = createTableApi({
  table: 'tjk_destinations',
  moduleName: 'tjk-destinations',
  orderBy: 'libelle ASC',
  numericKeys: [
    'quantiteDefaut',
    'poidsUniteKg',
    'prixTrans',
    'prixTransport',
    'totalTransport',
    'prixVoyage',
    'totalPaiement',
  ],
  prepareInsert: async (data) => {
    const libelle = normalizeLibelle(data.libelle);
    if (!libelle) throw HttpError(400, 'Libellé de destination requis.');
    return { ...data, libelle };
  },
  prepareUpdate: async (data) => {
    if (data.libelle !== undefined) {
      const libelle = normalizeLibelle(data.libelle);
      if (!libelle) throw HttpError(400, 'Libellé de destination requis.');
      return { ...data, libelle };
    }
    return data;
  },
});

async function listDestinations() {
  await ensureSchema();
  return base.list();
}

async function getDestination(id) {
  await ensureSchema();
  return base.get(id);
}

async function createDestination(body, actor) {
  await ensureSchema();
  return base.create(body, actor);
}

async function updateDestination(id, body, actor) {
  await ensureSchema();
  return base.update(id, body, actor);
}

async function deleteDestination(id, actor) {
  await ensureSchema();
  return base.remove(id, actor);
}

module.exports = {
  listDestinations,
  getDestination,
  createDestination,
  updateDestination,
  deleteDestination,
};
