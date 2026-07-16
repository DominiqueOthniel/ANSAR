'use strict';

/** Point d’entrée Netlify → API complète (Supabase only). CommonJS (.cjs) car package.json a "type":"module". */
const { handle } = require('../../server/app.cjs');

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return handle(event);
};
