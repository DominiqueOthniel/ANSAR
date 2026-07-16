'use strict';

const { json, noContent, parseBody, normalizePath, corsHeaders } = require('./http.cjs');
const { proxyToFallback } = require('./proxy.cjs');
const trucks = require('./routes/trucks.cjs');
const drivers = require('./routes/drivers.cjs');
const thirdParties = require('./routes/third-parties.cjs');

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handleLocal(method, path, event, origin) {
  if (method === 'GET' && (path === '/api' || path === '/api/health')) {
    return json(
      200,
      {
        status: 'ok',
        version: '1.2.0-netlify',
        runtime: 'netlify-functions',
        capabilities: [
          'health',
          'trucks',
          'drivers-read',
          'third-parties-read',
          'fallback-proxy',
        ],
      },
      origin,
    );
  }

  if (path === '/api/trucks') {
    if (method === 'GET') return json(200, await trucks.listTrucks(), origin);
    if (method === 'POST') {
      const body = parseBody(event);
      return json(201, await trucks.createTruck(body), origin);
    }
  }

  const truckMatch = path.match(/^\/api\/trucks\/([^/]+)$/);
  if (truckMatch && UUID.test(truckMatch[1])) {
    const id = truckMatch[1];
    if (method === 'GET') {
      const row = await trucks.getTruck(id);
      if (!row) return json(404, { message: `Camion ${id} introuvable` }, origin);
      return json(200, row, origin);
    }
    if (method === 'PATCH') {
      const row = await trucks.updateTruck(id, parseBody(event));
      if (!row) return json(404, { message: `Camion ${id} introuvable` }, origin);
      return json(200, row, origin);
    }
    if (method === 'DELETE') {
      const ok = await trucks.deleteTruck(id);
      if (!ok) return json(404, { message: `Camion ${id} introuvable` }, origin);
      return noContent(origin);
    }
  }

  if (path === '/api/drivers' && method === 'GET') {
    return json(200, await drivers.listDrivers(), origin);
  }
  const driverMatch = path.match(/^\/api\/drivers\/([^/]+)$/);
  if (driverMatch && UUID.test(driverMatch[1]) && method === 'GET') {
    const row = await drivers.getDriver(driverMatch[1]);
    if (!row) return json(404, { message: `Chauffeur introuvable` }, origin);
    return json(200, row, origin);
  }

  if (path === '/api/third-parties' && method === 'GET') {
    const type =
      event.queryStringParameters?.type ||
      new URLSearchParams(event.rawQuery || '').get('type') ||
      undefined;
    return json(200, await thirdParties.listThirdParties(type || undefined), origin);
  }
  const tpMatch = path.match(/^\/api\/third-parties\/([^/]+)$/);
  if (tpMatch && UUID.test(tpMatch[1]) && method === 'GET') {
    const row = await thirdParties.getThirdParty(tpMatch[1]);
    if (!row) return json(404, { message: `Tiers introuvable` }, origin);
    return json(200, row, origin);
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
    return {
      statusCode: 204,
      headers: corsHeaders(origin),
      body: '',
    };
  }

  const path = normalizePath(event);

  try {
    const local = await handleLocal(method, path, event, origin);
    if (local) return local;

    const proxied = await proxyToFallback(event, path);
    if (proxied) return proxied;

    return json(
      501,
      {
        message:
          'Route pas encore migrée sur Netlify. Définis API_FALLBACK_URL (URL Koyeb) le temps de la migration, ou attends le portage du module.',
        path,
        method,
      },
      origin,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[netlify-api]', message);
    return json(500, { message }, origin);
  }
}

module.exports = { handle };
