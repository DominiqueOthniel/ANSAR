'use strict';

/**
 * Point d’entrée Netlify Functions → API légère (pg + Supabase).
 * Bundle léger (pas Nest) → compatible plan Free.
 */
const { handle } = require('../../server/app.cjs');

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return handle(event);
};
