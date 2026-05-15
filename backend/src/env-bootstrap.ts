/**
 * Charge `.env` avant tout autre module Nest (notamment `AppModule` / TypeORM).
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}
