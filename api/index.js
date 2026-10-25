import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { handle } = require('../server/app.cjs');

async function readBody(req) {
  if (req.body == null) {
    if (typeof req.text === 'function') {
      return await req.text();
    }
    return '';
  }
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body);
}

function toQuery(req) {
  try {
    const host = req.headers?.host || 'localhost';
    const url = new URL(req.url || '/', `https://${host}`);
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

function pathnameOf(req) {
  try {
    const host = req.headers?.host || 'localhost';
    return new URL(req.url || '/', `https://${host}`).pathname;
  } catch {
    return '/api';
  }
}

export default async function handler(req, res) {
  const path = pathnameOf(req);
  const method = String(req.method || 'GET').toUpperCase();
  const body = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? '' : await readBody(req);

  const event = {
    httpMethod: method,
    path,
    rawPath: path,
    headers: req.headers || {},
    queryStringParameters: toQuery(req),
    body,
    isBase64Encoded: false,
  };

  const result = await handle(event);
  const status = result?.statusCode || 500;
  const headers = result?.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) res.setHeader(key, value);
  }
  res.statusCode = status;
  if (result?.body == null || result.body === '') {
    res.end();
    return;
  }
  res.end(result.body);
}
