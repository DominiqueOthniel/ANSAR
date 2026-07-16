'use strict';

const { randomUUID } = require('crypto');
const { query } = require('./db.cjs');

function HttpError(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

function dateOnly(v) {
  if (v == null || v === '') return null;
  return String(v).split('T')[0];
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function actorFrom(event) {
  const h = event.headers || {};
  return {
    login: h['x-actor-login'] || h['X-Actor-Login'] || undefined,
    role: h['x-actor-role'] || h['X-Actor-Role'] || undefined,
  };
}

async function audit(module, action, entityId, summary, beforeData, afterData, actor) {
  try {
    await query(
      `INSERT INTO audit_logs (id, module, action, "entityId", "actorLogin", "actorRole", summary, "beforeData", "afterData", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,NOW())`,
      [
        randomUUID(),
        module,
        action,
        entityId || null,
        actor?.login || null,
        actor?.role || null,
        summary || null,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
      ],
    );
  } catch (err) {
    console.warn('[audit]', err.message);
  }
}

/** Convertit une ligne pg (snake déjà camel dans nos tables) en objet JSON propre. */
function rowToJson(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = k.toLowerCase().includes('at')
        ? v.toISOString()
        : v.toISOString().slice(0, 10);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = v; // jsonb already parsed by pg
    } else if (v != null && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && /montant|prix|solde|quantite|recette|taux|tva|tps|remise|commission/i.test(k)) {
      out[k] = Number(v);
    } else {
      out[k] = v === null ? undefined : v;
    }
  }
  return out;
}

function rowsToJson(rows) {
  return rows.map(rowToJson);
}

async function getById(table, id) {
  const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return rowToJson(rows[0]);
}

module.exports = {
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
};
