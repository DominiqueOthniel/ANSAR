'use strict';

/**
 * API SIA-ANSAR pour Netlify Functions → Supabase (Postgres).
 * Aucun backend externe (pas de Koyeb).
 */
const { json, noContent, parseBody, normalizePath, corsHeaders } = require('./http.cjs');
const { HttpError, actorFrom } = require('./lib.cjs');
const trucks = require('./routes/trucks.cjs');
const caisse = require('./routes/caisse.cjs');
const bank = require('./routes/bank.cjs');
const credits = require('./routes/credits.cjs');
const clientOps = require('./routes/client-ops.cjs');
const loadings = require('./routes/loadings.cjs');
const admin = require('./routes/admin.cjs');
const R = require('./routes/resources.cjs');

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function qs(event) {
  return event.queryStringParameters || {};
}

async function handleLocal(method, path, event, origin) {
  const actor = actorFrom(event);
  const body = () => parseBody(event);
  const p = qs(event);

  if (method === 'GET' && (path === '/api' || path === '/api/health')) {
    return json(
      200,
      {
        status: 'ok',
        version: '2.0.0-netlify',
        runtime: 'netlify-functions',
        capabilities: [
          'trucks',
          'drivers',
          'trips',
          'expenses',
          'invoices',
          'third-parties',
          'bank',
          'caisse',
          'credits',
          'articles',
          'merchandise-qualities',
          'parcel-expeditions',
          'client-orders',
          'client-deliveries',
          'supplier-loadings',
          'audit-logs',
          'admin',
        ],
      },
      origin,
    );
  }

  // --- trucks ---
  if (path === '/api/trucks') {
    if (method === 'GET') return json(200, await trucks.listTrucks(), origin);
    if (method === 'POST') return json(201, await trucks.createTruck(body()), origin);
  }
  let m = path.match(/^\/api\/trucks\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await trucks.getTruck(id);
      if (!row) return json(404, { message: 'Camion introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') {
      const row = await trucks.updateTruck(id, body());
      if (!row) return json(404, { message: 'Camion introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'DELETE') {
      if (!(await trucks.deleteTruck(id))) return json(404, { message: 'Camion introuvable' }, origin);
      return noContent(origin);
    }
  }

  // --- drivers ---
  if (path === '/api/drivers') {
    if (method === 'GET') return json(200, await R.listDriversFull(), origin);
    if (method === 'POST') return json(201, await R.createDriver(body(), actor), origin);
  }
  m = path.match(/^\/api\/drivers\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.getDriverFull(id);
      if (!row) return json(404, { message: 'Chauffeur introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.driversApi.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.driversApi.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- third-parties ---
  if (path === '/api/third-parties') {
    if (method === 'GET') {
      const type = p.type;
      if (type) return json(200, await R.thirdParties.list('type = $1', [type]), origin);
      return json(200, await R.thirdParties.list(), origin);
    }
    if (method === 'POST') return json(201, await R.thirdParties.create(body(), actor), origin);
  }
  m = path.match(/^\/api\/third-parties\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.thirdParties.get(id);
      if (!row) return json(404, { message: 'Tiers introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.thirdParties.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.thirdParties.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- trips ---
  if (path === '/api/trips') {
    if (method === 'GET') return json(200, await R.trips.list(), origin);
    if (method === 'POST') return json(201, await R.trips.create(body(), actor), origin);
  }
  m = path.match(/^\/api\/trips\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.trips.get(id);
      if (!row) return json(404, { message: 'Trajet introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.trips.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.trips.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- expenses ---
  if (path === '/api/expenses') {
    if (method === 'GET') return json(200, await R.expenses.list(), origin);
    if (method === 'POST') return json(201, await R.expenses.create(body(), actor), origin);
  }
  m = path.match(/^\/api\/expenses\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.expenses.get(id);
      if (!row) return json(404, { message: 'Dépense introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.expenses.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.expenses.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- invoices ---
  if (path === '/api/invoices') {
    if (method === 'GET') return json(200, await R.invoices.list(), origin);
    if (method === 'POST') return json(201, await R.invoices.create(body(), actor), origin);
  }
  m = path.match(/^\/api\/invoices\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.invoices.get(id);
      if (!row) return json(404, { message: 'Facture introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.invoices.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.invoices.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- merchandise ---
  if (path === '/api/merchandise-qualities') {
    if (method === 'GET') return json(200, await R.merchandise.list(), origin);
    if (method === 'POST') return json(201, await R.merchandise.create(body(), actor), origin);
  }
  m = path.match(/^\/api\/merchandise-qualities\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.merchandise.get(id);
      if (!row) return json(404, { message: 'Qualité introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.merchandise.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.merchandise.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- articles ---
  if (path === '/api/articles') {
    if (method === 'GET') return json(200, await R.listArticlesFull(), origin);
    if (method === 'POST') return json(201, await R.articles.create(body(), actor), origin);
  }
  m = path.match(/^\/api\/articles\/([^/]+)\/supplier-prices$/);
  if (m && UUID.test(m[1]) && method === 'POST') {
    return json(201, await R.addSupplierPrice(m[1], body(), actor), origin);
  }
  m = path.match(/^\/api\/articles\/supplier-prices\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    if (method === 'PATCH') return json(200, await R.updateSupplierPrice(m[1], body(), actor), origin);
    if (method === 'DELETE') {
      await R.deleteSupplierPrice(m[1]);
      return noContent(origin);
    }
  }
  m = path.match(/^\/api\/articles\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.getArticleFull(id);
      if (!row) return json(404, { message: 'Article introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.articles.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.articles.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- parcels ---
  if (path === '/api/parcel-expeditions') {
    if (method === 'GET') return json(200, await R.parcels.list(), origin);
    if (method === 'POST') return json(201, await R.parcels.create(body(), actor), origin);
  }
  m = path.match(/^\/api\/parcel-expeditions\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await R.parcels.get(id);
      if (!row) return json(404, { message: 'Expédition introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await R.parcels.update(id, body(), actor), origin);
    if (method === 'DELETE') {
      await R.parcels.remove(id, actor);
      return noContent(origin);
    }
  }

  // --- client orders / deliveries ---
  if (path === '/api/client-orders') {
    if (method === 'GET') return json(200, await clientOps.listOrders(p.clientId), origin);
    if (method === 'POST') return json(201, await clientOps.createOrder(body(), actor), origin);
  }
  m = path.match(/^\/api\/client-orders\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await clientOps.getOrder(id);
      if (!row) return json(404, { message: 'Commande introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await clientOps.updateOrder(id, body(), actor), origin);
    if (method === 'DELETE') {
      await clientOps.deleteOrder(id, actor);
      return noContent(origin);
    }
  }
  if (path === '/api/client-deliveries') {
    if (method === 'GET') return json(200, await clientOps.listDeliveries(p.clientId), origin);
    if (method === 'POST') return json(201, await clientOps.createDelivery(body(), actor), origin);
  }
  m = path.match(/^\/api\/client-deliveries\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await clientOps.getDelivery(id);
      if (!row) return json(404, { message: 'Livraison introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await clientOps.updateDelivery(id, body(), actor), origin);
    if (method === 'DELETE') {
      await clientOps.deleteDelivery(id, actor);
      return noContent(origin);
    }
  }

  // --- supplier loadings ---
  if (path === '/api/supplier-loadings') {
    if (method === 'GET') return json(200, await loadings.listLoadings(p), origin);
    if (method === 'POST') return json(201, await loadings.createLoading(body(), actor), origin);
  }
  m = path.match(/^\/api\/supplier-loadings\/([^/]+)\/assignments$/);
  if (m && UUID.test(m[1]) && method === 'PUT') {
    return json(200, await loadings.setAssignments(m[1], body(), actor), origin);
  }
  m = path.match(/^\/api\/supplier-loadings\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await loadings.getLoading(id);
      if (!row) return json(404, { message: 'Bon introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await loadings.updateLoading(id, body(), actor), origin);
    if (method === 'DELETE') {
      await loadings.deleteLoading(id, actor);
      return noContent(origin);
    }
  }

  // --- caisse ---
  if (path === '/api/caisse/config') {
    if (method === 'GET') return json(200, await caisse.getConfig(), origin);
    if (method === 'PATCH') return json(200, await caisse.updateConfig(body()), origin);
  }
  if (path === '/api/caisse/balance' && method === 'GET') {
    return json(200, await caisse.getBalance(), origin);
  }
  if (path === '/api/caisse/transactions') {
    if (method === 'GET') return json(200, await caisse.listTx(), origin);
    if (method === 'POST') return json(201, await caisse.createTx(body(), actor), origin);
  }
  if (path === '/api/caisse/transactions/upsert-by-reference' && method === 'POST') {
    const ref = p.reference || body().reference;
    return json(200, await caisse.upsertByReference(ref, body(), actor), origin);
  }
  if (path === '/api/caisse/transactions/by-reference' && method === 'DELETE') {
    await caisse.removeByReference(p.reference);
    return noContent(origin);
  }
  m = path.match(/^\/api\/caisse\/transactions\/(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'PATCH') return json(200, await caisse.updateTx(id, body(), actor), origin);
    if (method === 'DELETE') {
      await caisse.deleteTx(id, actor);
      return noContent(origin);
    }
  }

  // --- bank ---
  if (path === '/api/bank/accounts') {
    if (method === 'GET') return json(200, await bank.listAccounts(), origin);
    if (method === 'POST') return json(201, await bank.createAccount(body(), actor), origin);
  }
  m = path.match(/^\/api\/bank\/accounts\/([^/]+)\/transactions$/);
  if (m && UUID.test(m[1]) && method === 'GET') {
    return json(200, await bank.listTransactions(m[1]), origin);
  }
  m = path.match(/^\/api\/bank\/accounts\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await bank.getAccount(id);
      if (!row) return json(404, { message: 'Compte introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await bank.updateAccount(id, body(), actor), origin);
    if (method === 'DELETE') {
      await bank.deleteAccount(id, actor);
      return noContent(origin);
    }
  }
  if (path === '/api/bank/transactions') {
    if (method === 'GET') return json(200, await bank.listTransactions(), origin);
    if (method === 'POST') return json(201, await bank.createTransaction(body(), actor), origin);
  }
  m = path.match(/^\/api\/bank\/transactions\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await bank.getTransaction(id);
      if (!row) return json(404, { message: 'Transaction introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await bank.updateTransaction(id, body(), actor), origin);
    if (method === 'DELETE') {
      await bank.deleteTransaction(id, actor);
      return noContent(origin);
    }
  }

  // --- credits ---
  if (path === '/api/credits') {
    if (method === 'GET') return json(200, await credits.listCredits(), origin);
    if (method === 'POST') return json(201, await credits.createCredit(body(), actor), origin);
  }
  m = path.match(/^\/api\/credits\/([^/]+)\/remboursements$/);
  if (m && UUID.test(m[1]) && method === 'POST') {
    return json(201, await credits.addRemboursement(m[1], body(), actor), origin);
  }
  m = path.match(/^\/api\/credits\/([^/]+)$/);
  if (m && UUID.test(m[1])) {
    const id = m[1];
    if (method === 'GET') {
      const row = await credits.getCredit(id);
      if (!row) return json(404, { message: 'Crédit introuvable' }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') return json(200, await credits.updateCredit(id, body(), actor), origin);
    if (method === 'DELETE') {
      await credits.deleteCredit(id, actor);
      return noContent(origin);
    }
  }

  // --- audit ---
  if (path === '/api/audit-logs' && method === 'GET') {
    return json(200, await admin.listAudit(p), origin);
  }

  // --- admin ---
  if (path === '/api/admin/purge' && method === 'DELETE') {
    return json(200, await admin.purge(), origin);
  }
  if (path === '/api/admin/backup' && method === 'GET') {
    const dump = await admin.backup();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="sia-ansar-backup.json"`,
        ...corsHeaders(origin),
      },
      body: JSON.stringify(dump, null, 2),
    };
  }
  if (path === '/api/admin/restore' && method === 'POST') {
    return json(200, await admin.restore(body()), origin);
  }

  return null;
}

async function handle(event) {
  const origin = event.headers?.origin || event.headers?.Origin;
  const method = (
    event.httpMethod ||
    event.requestContext?.http?.method ||
    'GET'
  ).toUpperCase();

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  const path = normalizePath(event);
  try {
    const res = await handleLocal(method, path, event, origin);
    if (res) return res;
    return json(404, { message: `Route introuvable: ${method} ${path}` }, origin);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api]', method, path, message);
    return json(status, { message }, origin);
  }
}

module.exports = { handle };
