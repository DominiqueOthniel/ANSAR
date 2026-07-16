'use strict';

/**
 * CRUD générique pour tables à clé UUID et colonnes camelCase.
 * columns: [{ key, required?, json? }]
 */
const {
  HttpError,
  dateOnly,
  num,
  audit,
  rowToJson,
  randomUUID,
  query,
} = require('./lib.cjs');

function quoteIdent(name) {
  return `"${name.replace(/"/g, '')}"`;
}

function mapRow(row, numericKeys = []) {
  if (!row) return null;
  const j = rowToJson(row);
  for (const k of numericKeys) {
    if (j[k] != null) j[k] = num(j[k]);
  }
  return j;
}

function createTableApi(opts) {
  const {
    table,
    moduleName,
    orderBy = 'id',
    numericKeys = [],
    dateKeys = [],
    jsonKeys = [],
    prepareInsert,
    prepareUpdate,
    afterWrite,
  } = opts;

  async function list(whereSql = '', params = []) {
    const { rows } = await query(
      `SELECT * FROM ${table}${whereSql ? ` WHERE ${whereSql}` : ''} ORDER BY ${orderBy}`,
      params,
    );
    return rows.map((r) => mapRow(r, numericKeys));
  }

  async function get(id) {
    const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return mapRow(rows[0], numericKeys);
  }

  async function create(body, actor) {
    const id = randomUUID();
    let data = { ...body, id };
    if (prepareInsert) data = (await prepareInsert(data)) || data;
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const cols = keys.map(quoteIdent).join(', ');
    const vals = keys
      .map((k, i) => {
        if (jsonKeys.includes(k)) return `$${i + 1}::jsonb`;
        return `$${i + 1}`;
      })
      .join(', ');
    const values = keys.map((k) => {
      let v = data[k];
      if (dateKeys.includes(k)) v = dateOnly(v);
      if (jsonKeys.includes(k) && v != null && typeof v !== 'string') v = JSON.stringify(v);
      if (v === undefined) v = null;
      return v;
    });
    await query(`INSERT INTO ${table} (${cols}) VALUES (${vals})`, values);
    const row = await get(id);
    if (afterWrite) await afterWrite('create', row, actor);
    await audit(moduleName, 'CREATE', id, `Création ${moduleName}`, null, row, actor);
    return row;
  }

  async function update(id, body, actor) {
    const before = await get(id);
    if (!before) throw HttpError(404, `${moduleName} introuvable`);
    let data = { ...body };
    if (prepareUpdate) data = (await prepareUpdate(data, before)) || data;
    const keys = Object.keys(data).filter((k) => k !== 'id' && data[k] !== undefined);
    if (!keys.length) return before;
    const sets = keys
      .map((k, i) => {
        const ph = jsonKeys.includes(k) ? `$${i + 2}::jsonb` : `$${i + 2}`;
        return `${quoteIdent(k)} = ${ph}`;
      })
      .join(', ');
    const values = keys.map((k) => {
      let v = data[k];
      if (dateKeys.includes(k)) v = dateOnly(v);
      if (jsonKeys.includes(k) && v != null && typeof v !== 'string') v = JSON.stringify(v);
      return v;
    });
    await query(`UPDATE ${table} SET ${sets} WHERE id = $1`, [id, ...values]);
    const after = await get(id);
    if (afterWrite) await afterWrite('update', after, actor, before);
    await audit(moduleName, 'UPDATE', id, `Modification ${moduleName}`, before, after, actor);
    return after;
  }

  async function remove(id, actor) {
    const before = await get(id);
    if (!before) throw HttpError(404, `${moduleName} introuvable`);
    await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    await audit(moduleName, 'DELETE', id, `Suppression ${moduleName}`, before, null, actor);
  }

  return { list, get, create, update, remove };
}

module.exports = { createTableApi, mapRow, quoteIdent };
