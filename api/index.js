import { createRequire } from 'node:module';

/** /api → même handler que Netlify (server/app.cjs via adaptateur). */
const require = createRequire(import.meta.url);
const { vercelHandler } = require('../server/vercel-adapter.cjs');

export default vercelHandler;
