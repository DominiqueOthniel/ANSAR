'use strict';

const { HttpError, query, rowToJson } = require('../lib.cjs');

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
      // map to camelCase keys expected by front
      const map = {
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
      data[map[t] || key] = rows;
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

async function restore(body) {
  const data = body?.data;
  if (!data) throw HttpError(400, 'Corps invalide : propriété "data" manquante');
  await purge();
  const insert = async (table, rows) => {
    if (!rows?.length) return;
    for (const row of rows) {
      const cols = Object.keys(row);
      const colSql = cols.map((c) => `"${c}"`).join(', ');
      const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
      try {
        await query(
          `INSERT INTO ${table} (${colSql}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
          cols.map((c) => {
            const v = row[c];
            if (v != null && typeof v === 'object' && !(v instanceof Date)) {
              return JSON.stringify(v);
            }
            return v;
          }),
        );
      } catch (e) {
        console.warn('restore row', table, e.message);
      }
    }
  };
  await insert('third_parties', data.thirdParties);
  await insert('merchandise_qualities', data.merchandiseQualities);
  await insert('articles', data.articles);
  await insert('article_supplier_prices', data.articleSupplierPrices);
  await insert('drivers', data.drivers);
  await insert('driver_transactions', data.driverTransactions);
  await insert('trucks', data.trucks);
  await insert('trips', data.trips);
  await insert('parcel_expeditions', data.parcelExpeditions);
  await insert('client_orders', data.clientOrders);
  await insert('client_deliveries', data.clientDeliveries);
  await insert('supplier_loadings', data.supplierLoadings);
  await insert('supplier_loading_assignments', data.supplierLoadingAssignments);
  await insert('expenses', data.expenses);
  await insert('invoices', data.invoices);
  await insert('bank_accounts', data.bankAccounts);
  await insert('bank_transactions', data.bankTransactions);
  await insert('caisse_config', data.caisseConfig);
  await insert('caisse_transactions', data.caisseTransactions);
  await insert('credits', data.credits);
  await insert('credit_remboursements', data.creditRemboursements);
  return {
    message: 'Restauration réussie',
    counts: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    ),
  };
}

module.exports = { listAudit, purge, backup, restore };
