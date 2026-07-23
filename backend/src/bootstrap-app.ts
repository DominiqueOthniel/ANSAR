/**
 * Bootstrap Nest partagé : serveur Node (Koyeb/local) et Netlify Functions.
 * Aucune écoute HTTP ici — l’appelant décide (listen vs serverless-http).
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import express from 'express';
import { AppModule } from './app.module';

export type NestExpressInstance = ReturnType<typeof express>;

function trimOrigin(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

function configureCors(app: Awaited<ReturnType<typeof NestFactory.create>>): void {
  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:5173',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:3003',
    'http://127.0.0.1:5173',
  ];
  if (process.env.FRONTEND_URL?.trim()) {
    allowedOrigins.push(trimOrigin(process.env.FRONTEND_URL));
  }
  const extraOrigins = (process.env.ADDITIONAL_CORS_ORIGINS || '')
    .split(',')
    .map((s) => trimOrigin(s))
    .filter(Boolean);
  allowedOrigins.push(...extraOrigins);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      const o = trimOrigin(origin);
      const isAllowed =
        allowedOrigins.some((a) => trimOrigin(a) === o) ||
        /^https:\/\/[\w.-]+\.netlify\.app$/i.test(o) ||
        /^https:\/\/[\w.-]+\.vercel\.app$/i.test(o) ||
        /^https:\/\/[\w.-]+\.onrender\.com$/i.test(o) ||
        /^https:\/\/[\w.-]+\.railway\.app$/i.test(o) ||
        /^https:\/\/[\w.-]+\.koyeb\.app$/i.test(o);
      callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-actor-login', 'x-actor-role'],
  });
}

/**
 * Crée l’app Nest branchée sur Express (préfixe `/api`, validation, CORS).
 * Réutilise AppModule + TypeORM → même DATABASE_URL / Supabase.
 */
export async function createNestExpressApp(): Promise<NestExpressInstance> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: process.env.NETLIFY === 'true' ? ['error', 'warn'] : undefined,
  });

  app.use(json({ limit: '15mb' }));
  app.use(
    urlencoded({
      limit: '15mb',
      extended: true,
    }),
  );

  configureCors(app);
  app.setGlobalPrefix('api');

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/', (_req: unknown, res: { json: (b: object) => void }) => {
    res.json({
      name: 'SIA-ANSAR API',
      version: '1.0.0',
      api: '/api',
      docs: 'GET /api/health pour le health check.',
    });
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  return expressApp;
}
