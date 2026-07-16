'use strict';

const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !String(connectionString).trim()) {
    throw new Error('DATABASE_URL manquante (Supabase pooler port 6543).');
  }
  pool = new Pool({
    connectionString: String(connectionString).trim(),
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

module.exports = { getPool, query };
