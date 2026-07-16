'use strict';

/** Point d’entrée Netlify → API complète (Supabase only, pas de Koyeb). */
const { handle } = require('../../server/app.cjs');

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return handle(event);
};
