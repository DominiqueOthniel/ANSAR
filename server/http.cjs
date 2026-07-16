'use strict';

const ALLOWED_EXTRA = (process.env.ADDITIONAL_CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const o = origin.trim().replace(/\/+$/, '');
  if (process.env.FRONTEND_URL && o === process.env.FRONTEND_URL.replace(/\/+$/, '')) {
    return true;
  }
  if (ALLOWED_EXTRA.includes(o)) return true;
  return (
    /^https:\/\/[\w.-]+\.netlify\.app$/i.test(o) ||
    /^https:\/\/[\w.-]+\.vercel\.app$/i.test(o) ||
    /^http:\/\/localhost(:\d+)?$/i.test(o) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/i.test(o)
  );
}

function corsHeaders(origin) {
  const allow = isAllowedOrigin(origin) ? origin || '*' : 'null';
  return {
    'Access-Control-Allow-Origin': allow === 'null' ? 'null' : allow || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-actor-login, x-actor-role',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  };
}

function json(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
    body: JSON.stringify(body),
  };
}

function noContent(origin) {
  return {
    statusCode: 204,
    headers: corsHeaders(origin),
    body: '',
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizePath(event) {
  let p = event.rawPath || event.path || '/';
  if (p.includes('/.netlify/functions/api')) {
    p = p.replace(/.*\/\.netlify\/functions\/api/, '/api') || '/api';
  }
  if (!p.startsWith('/api')) {
    p = '/api' + (p.startsWith('/') ? p : `/${p}`);
  }
  // strip trailing slash except root
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

module.exports = {
  corsHeaders,
  json,
  noContent,
  parseBody,
  normalizePath,
  isAllowedOrigin,
};
