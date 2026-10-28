'use strict';

/**
 * Adaptateur Vercel (Node req/res) → format événement Netlify/AWS
 * consommé par server/app.cjs — sans modifier le runtime Netlify.
 */
const { handle } = require('./app.cjs');

function headerValue(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

/** Chemin d’origine si Vercel a réécrit /api/* vers /api. */
function resolveRawUrl(req) {
  const headers = req.headers || {};
  const candidates = [
    req.url,
    headerValue(headers, 'x-forwarded-uri'),
    headerValue(headers, 'x-invoke-path'),
    headerValue(headers, 'x-vercel-forwarded-path'),
  ].filter(Boolean);

  let best = candidates[0] || '/';
  for (const c of candidates) {
    try {
      const pathOnly = String(c).split('?')[0] || '';
      if (pathOnly.startsWith('/api/') && pathOnly.length > 4) {
        best = c;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  return best;
}

function toEvent(req) {
  const host = headerValue(req.headers, 'host') || 'localhost';
  const proto = headerValue(req.headers, 'x-forwarded-proto') || 'https';
  const rawUrl = resolveRawUrl(req);
  const url = new URL(rawUrl, `${proto}://${host}`);

  let pathname = url.pathname || '/';
  // Normalise les chemins Vercel vers /api/...
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + (pathname.startsWith('/') ? pathname : `/${pathname}`);
  }

  const queryStringParameters = {};
  for (const [k, v] of url.searchParams.entries()) {
    queryStringParameters[k] = v;
  }

  let body = '';
  let isBase64Encoded = false;
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) {
      body = req.body.toString('base64');
      isBase64Encoded = true;
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
    }
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    headers[k] = Array.isArray(v) ? v.join(',') : v;
  }

  return {
    httpMethod: (req.method || 'GET').toUpperCase(),
    path: pathname,
    rawPath: pathname,
    headers,
    body,
    isBase64Encoded,
    queryStringParameters,
  };
}

async function vercelHandler(req, res) {
  try {
    const result = await handle(toEvent(req));
    const status = result.statusCode || 500;
    const outHeaders = result.headers || {};
    for (const [k, v] of Object.entries(outHeaders)) {
      if (v != null) res.setHeader(k, v);
    }
    res.statusCode = status;
    if (result.body == null || result.body === '') {
      res.end();
      return;
    }
    res.end(result.body);
  } catch (err) {
    console.error('[vercel-api]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

module.exports = { vercelHandler, toEvent, resolveRawUrl };
