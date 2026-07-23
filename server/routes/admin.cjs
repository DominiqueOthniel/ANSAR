'use strict';

const { HttpError, query, rowToJson } = require('../lib.cjs');

const INSERT_BATCH_SIZE = 80;

async function listAudit(params = {}) {
  const args = [];
  let sql = `SELECT * FROM audit_logs WHERE 1=1`;
  if (params.module) {
    args.push(params.module);
    sql += ` AND module = $${args.length}`;
  }
  if (params.action) {
    args.push(params.action);
    sql += ` AND action = $${args.length}`;
  }
  if (params.actorLogin) {
    args.push(params.actorLogin);
    sql += ` AND "actorLogin" = $${args.length}`;
  }
  if (params.from) {
    args.push(params.from);
    sql += ` AND "createdAt" >= $${args.length}::timestamptz`;
  }
  if (params.to) {
    args.push(params.to);
    sql += ` AND "createdAt" <= $${args.length}::timestamptz`;
  }
  const limit = Math.min(Number(params.limit) || 200, 1000);
  sql += ` ORDER BY "createdAt" DESC LIMIT ${limit}`;
  const { rows } = await query(sql, args);
  return rows.map((r) => rowToJson(r));
}

const PURGE_TABLES = [
  'audit_logs',
  'credit_remboursements',
  'credits',
  'caisse_transactions',
  'supplier_loading_assignments',
  'supplier_loadings',
  'invoices',
  'expenses',
  'client_deliveries',
  'client_orders',
  'article_supplier_prices',
  'articles',
  'parcel_expeditions',
  'trips',
  'driver_transactions',
  'bank_transactions',
  'bank_accounts',
  'trucks',
  'drivers',
  'third_parties',
  'merchandise_qualities',
  'caisse_config',
];

const TABLE_KEY_MAP = {
  third_parties: 'thirdParties',
  merchandise_qualities: 'merchandiseQualities',
  article_supplier_prices: 'articleSupplierPrices',
  driver_transactions: 'driverTransactions',
  bank_accounts: 'bankAccounts',
  bank_transactions: 'bankTransactions',
  parcel_expeditions: 'parcelExpeditions',
  client_orders: 'clientOrders',
  client_deliveries: 'clientDeliveries',
  supplier_loadings: 'supplierLoadings',
  supplier_loading_assignments: 'supplierLoadingAssignments',
  caisse_config: 'caisseConfig',
  caisse_transactions: 'caisseTransactions',
  credit_remboursements: 'creditRemboursements',
};

async function purge() {
  await query(`TRUNCATE TABLE ${PURGE_TABLES.map((t) => t).join(', ')} RESTART IDENTITY CASCADE`);
  await query(`INSERT INTO caisse_config (id, "soldeInitial") VALUES (1, 0) ON CONFLICT (id) DO NOTHING`);
  return { message: 'Base de données purgée avec succès' };
}

async function backup() {
  const tables = [
    'third_parties',
    'merchandise_qualities',
    'articles',
    'article_supplier_prices',
    'drivers',
    'driver_transactions',
    'trucks',
    'trips',
    'expenses',
    'invoices',
    'bank_accounts',
    'bank_transactions',
    'parcel_expeditions',
    'client_orders',
    'client_deliveries',
    'supplier_loadings',
    'supplier_loading_assignments',
    'caisse_config',
    'caisse_transactions',
    'credits',
    'credit_remboursements',
  ];
  const data = {};
  for (const t of tables) {
    try {
      const { rows } = await query(`SELECT * FROM ${t}`);
      const key = t.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      data[TABLE_KEY_MAP[t] || key] = rows;
    } catch (e) {
      console.warn('backup skip', t, e.message);
    }
  }
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    data,
  };
}

function normalizeValue(v) {
  if (v === undefined) return null;
  if (v != null && typeof v === 'object' && !(v instanceof Date)) {
    return JSON.stringify(v);
  }
  return v;
}

/**
 * Insert par lots pour rester sous le timeout Netlify (~10s free / 26s pro).
 * Un INSERT unitaire par ligne vers Supabase provoquait le 504.
 */
async function insertBatched(table, rows) {
  if (!rows?.length) return 0;

  const keySet = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) keySet.add(k);
  }
  const keys = [...keySet];
  if (!keys.length) return 0;

  const colSql = keys.map((c) => `"${c}"`).join(', ');
  let inserted = 0;

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    const params = [];
    const valueGroups = chunk.map((row) => {
      const placeholders = keys.map((k) => {
        params.push(normalizeValue(row[k]));
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    try {
      await query(
        `INSERT INTO ${table} (${colSql}) VALUES ${valueGroups.join(', ')} ON CONFLICT (id) DO NOTHING`,
        params,
      );
      inserted += chunk.length;
    } catch (e) {
      console.warn('restore batch failed, fallback row by row', table, e.message);
      for (const row of chunk) {
        const cols = Object.keys(row);
        if (!cols.length) continue;
        const rowColSql = cols.map((c) => `"${c}"`).join(', ');
        const ph = cols.map((_, idx) => `$${idx + 1}`).join(', ');
        try {
          await query(
            `INSERT INTO ${table} (${rowColSql}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
            cols.map((c) => normalizeValue(row[c])),
          );
          inserted += 1;
        } catch (rowErr) {
          console.warn('restore row', table, rowErr.message);
        }
      }
    }
  }

  return inserted;
}

async function restore(body) {
  const data = body?.data ?? body;
  if (!data || typeof data !== 'object') {
    throw HttpError(400, 'Corps invalide : propriété "data" manquante');
  }

  await purge();

  const thirdPartyIds = new Set(
    (data.thirdParties || []).map((r) => r && r.id).filter(Boolean),
  );
  const credits = (data.credits || []).map((row) => {
    if (row.clientTierId && !thirdPartyIds.has(row.clientTierId)) {
      return { ...row, clientTierId: null };
    }
    return row;
  });

  // Ordre FK : chauffeurs/camions avant livraisons ; commandes avant affectations/factures
  await insertBatched('third_parties', data.thirdParties);
  await insertBatched('merchandise_qualities', data.merchandiseQualities);
  await insertBatched('articles', data.articles);
  await insertBatched('article_supplier_prices', data.articleSupplierPrices);
  await insertBatched('drivers', data.drivers);
  await insertBatched('driver_transactions', data.driverTransactions);
  await insertBatched('trucks', data.trucks);
  await insertBatched('trips', data.trips);
  await insertBatched('parcel_expeditions', data.parcelExpeditions);
  await insertBatched('bank_accounts', data.bankAccounts);
  await insertBatched('bank_transactions', data.bankTransactions);
  await insertBatched('client_orders', data.clientOrders);
  await insertBatched('client_deliveries', data.clientDeliveries);
  await insertBatched('supplier_loadings', data.supplierLoadings);
  await insertBatched('supplier_loading_assignments', data.supplierLoadingAssignments);
  await insertBatched('expenses', data.expenses);
  await insertBatched('invoices', data.invoices);
  await insertBatched('caisse_config', data.caisseConfig);
  await insertBatched('caisse_transactions', data.caisseTransactions);
  await insertBatched('credits', credits);
  await insertBatched('credit_remboursements', data.creditRemboursements);

  return {
    message: 'Restauration réussie',
    counts: Object.fromEntries(
      Object.entries({ ...data, credits }).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    ),
  };
}

module.exports = { listAudit, purge, backup, restore };
