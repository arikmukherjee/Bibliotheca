import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config, storageDirs } from './config.js';
import { pingDatabase } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { bookRoutes } from './modules/books/bookRoutes.js';
import { catalogRoutes } from './modules/catalog/catalogRoutes.js';
import { collectionRoutes } from './modules/collections/collectionRoutes.js';
import { exportRoutes } from './modules/export/exportRoutes.js';
import { identificationRoutes } from './modules/identification/identificationRoutes.js';
import { importRoutes } from './modules/import/importRoutes.js';
import { settingsRoutes } from './modules/settings/settingsRoutes.js';
import { statsRoutes } from './modules/stats/statsRoutes.js';
import { uploadRoutes } from './modules/uploads/uploadRoutes.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.clientOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: ['Content-Disposition'],
      maxAge: 86_400,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(
    '/uploads/covers',
    express.static(storageDirs.covers, {
      maxAge: '30d',
      immutable: true,
      dotfiles: 'deny',
      fallthrough: true,
      index: false,
    }),
  );

  app.get('/api/health', async (_req, res) => {
    const database = await pingDatabase();
    res.status(database ? 200 : 503).json({
      data: {
        status: database ? 'ok' : 'degraded',
        database: database ? 'ok' : 'unavailable',
        environment: config.nodeEnv,
        ocr: config.ocrEnabled ? 'enabled' : 'disabled',
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use('/api/books', bookRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/collections', collectionRoutes);
  app.use('/api/identify', identificationRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/import', importRoutes);
  app.use('/api/uploads', uploadRoutes);

  app.use('/api', notFoundHandler);

  if (config.isProduction) {
    const indexFile = path.join(config.clientDist, 'index.html');
    app.use(
      express.static(config.clientDist, {
        index: false,
        maxAge: '1h',
        setHeaders(response, filePath) {
          if (filePath.endsWith('index.html')) {
            response.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        next();
        return;
      }
      if (!fs.existsSync(indexFile)) {
        res.status(503).type('text/plain').send('The client build is missing. Run npm run build.');
        return;
      }
      res.sendFile(indexFile);
    });
  }

  app.use(errorHandler);
  return app;
}
