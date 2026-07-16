/**
 * EXPÉRIMENTAL — Nest en Netlify Function.
 * Le bundle backend (node_modules ~150Mo+) dépasse en pratique le plan Free.
 * Production recommandée : Render free (voir DEPLOIEMENT.md) + Netlify front.
 * Ce fichier est conservé pour essais futurs (plan payant / bundle slim).
 */
'use strict';

const path = require('path');

process.env.NETLIFY = 'true';

const backendRoot = path.join(__dirname, '..', '..', 'backend');
const Module = require('module');
const origNodePath = process.env.NODE_PATH || '';
process.env.NODE_PATH = [path.join(backendRoot, 'node_modules'), origNodePath]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

let cachedHandler;

function normalizeEvent(event) {
  const e = { ...event };
  const raw = e.rawPath || e.path || '';
  let p = raw;

  if (p.includes('/.netlify/functions/api')) {
    p = p.replace(/.*\/\.netlify\/functions\/api/, '/api') || '/api';
  }

  if (p === '/' || p === '') {
    p = '/';
  } else if (!p.startsWith('/api')) {
    p = '/api' + (p.startsWith('/') ? p : `/${p}`);
  }

  e.path = p;
  if (e.rawPath !== undefined) e.rawPath = p;
  return e;
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (!cachedHandler) {
    const { createNestExpressApp } = require(path.join(backendRoot, 'dist', 'bootstrap-app.js'));
    const serverless = require(path.join(backendRoot, 'node_modules', 'serverless-http'));
    const app = await createNestExpressApp();
    cachedHandler = serverless(app);
  }

  return cachedHandler(normalizeEvent(event), context);
};
