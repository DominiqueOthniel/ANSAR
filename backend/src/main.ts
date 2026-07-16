import './env-bootstrap';
import { createNestExpressApp } from './bootstrap-app';

async function bootstrap() {
  const expressApp = await createNestExpressApp();

  const port = Number.parseInt(String(process.env.PORT || 3000), 10) || 3000;
  const host = process.env.HOST || '0.0.0.0';

  await new Promise<void>((resolve, reject) => {
    const server = expressApp.listen(port, host, () => resolve());
    server.on('error', reject);
  });

  console.log(`SIA-ANSAR API: http://${host}:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[SIA-ANSAR] Échec démarrage API:', message);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
