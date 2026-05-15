import './env-bootstrap';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Limite de taille du body JSON (pour les images encodées en base64)
  app.use(json({ limit: '2mb' }));
  app.use(
    urlencoded({
      limit: '2mb',
      extended: true,
    }),
  );

  // CORS pour le frontend (Netlify, Vercel, Render, Railway, dev local)
  const trimOrigin = (u: string) => u.trim().replace(/\/+$/, '');
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
    origin: (origin, callback) => {
      // Pas d’Origin (curl, healthcheck) : autoriser sans en-tête reflect
      if (!origin) return callback(null, true);
      const o = trimOrigin(origin);
      const isAllowed =
        allowedOrigins.some((a) => trimOrigin(a) === o) ||
        /^https:\/\/[\w.-]+\.netlify\.app$/i.test(o) ||
        /^https:\/\/[\w.-]+\.vercel\.app$/i.test(o) ||
        /^https:\/\/[\w.-]+\.onrender\.com$/i.test(o) ||
        /^https:\/\/[\w.-]+\.railway\.app$/i.test(o) ||
        /^https:\/\/[\w.-]+\.koyeb\.app$/i.test(o);
      // Ne jamais passer une Error en 1er argument : le preflight OPTIONS peut perdre les en-têtes CORS.
      callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-actor-login', 'x-actor-role'],
  });

  // Préfixe global de l'API
  app.setGlobalPrefix('api');

  // GET / à la racine (sans toucher aux routes /api)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/', (req: any, res: any) => {
    res.json({
      name: 'Truck Track API',
      version: '1.0.0',
      api: '/api',
      docs: 'GET /api pour l’API, GET /api/health pour le health check.',
    });
  });

  // Validation des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number.parseInt(String(process.env.PORT || 3000), 10) || 3000;
  /** Koyeb / Docker : écouter sur toutes les interfaces (sinon health checks échouent). */
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);

  console.log(`🚚 Truck Track API: http://${host}:${port}/api`);
}

bootstrap();
