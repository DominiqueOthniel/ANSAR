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
  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
  ];
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) ||
        /^https:\/\/.*\.netlify\.app$/.test(origin) ||
        /^https:\/\/.*\.vercel\.app$/.test(origin) ||
        /^https:\/\/.*\.onrender\.com$/.test(origin) ||
        /^https:\/\/.*\.railway\.app$/.test(origin) ||
        /^https:\/\/.*\.koyeb\.app$/.test(origin);
      callback(isAllowed ? null : new Error('Not allowed by CORS'), isAllowed);
    },
    credentials: true,
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
