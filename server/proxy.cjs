'use strict';

/**
 * Pendant la migration : routes non portées → Nest sur Koyeb (API_FALLBACK_URL).
 * Retirer la variable quand tout est sur Netlify, puis éteindre Koyeb.
 */
async function proxyToFallback(event, path) {
  let base = (process.env.API_FALLBACK_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  if (base.endsWith('/api')) base = base.slice(0, -4);

  const params = event.queryStringParameters || {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const q = qs.toString();
  const url = `${base}${path}${q ? `?${q}` : ''}`;

  const headers = {};
  const h = event.headers || {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (['host', 'connection', 'content-length'].includes(key)) continue;
    if (v != null) headers[key] = Array.isArray(v) ? v[0] : String(v);
  }
  headers.accept = headers.accept || 'application/json';

  const method = (event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && event.body) {
    init.body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body;
  }

  const res = await fetch(url, init);
  const text = await res.text();
  const outHeaders = {
    'Content-Type': res.headers.get('content-type') || 'application/json',
  };
  const origin = h.origin || h.Origin;
  if (origin) {
    outHeaders['Access-Control-Allow-Origin'] = origin;
    outHeaders['Access-Control-Allow-Credentials'] = 'true';
  }

  return {
    statusCode: res.status,
    headers: outHeaders,
    body: text,
  };
}

module.exports = { proxyToFallback };
