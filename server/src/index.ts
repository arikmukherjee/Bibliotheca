import type { Server } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { pingDatabase, pool } from './db/pool.js';
import { ensureStorageDirectories } from './utils/files.js';
import { purgeExpiredCache } from './services/metadata/cache.js';
import { shutdownOcr } from './services/identification/ocr.js';

async function start(): Promise<void> {
  await ensureStorageDirectories();

  const app = createApp();
  let server: Server;
  try {
    server = app.listen(config.port, () => {
      console.log(`Bibliotheca API listening on http://localhost:${config.port}`);
      if (!config.isProduction) {
        console.log(`Client dev origin: ${config.clientOrigins.join(', ')}`);
      }
    });
  } catch (error) {
    console.error('Could not start the server:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${config.port} is already in use. Set PORT in .env or stop the process using it.`,
      );
    } else {
      console.error('Server error:', error.message);
    }
    process.exitCode = 1;
  });

  const databaseReady = await pingDatabase();
  if (databaseReady) {
    console.log(`Connected to MySQL database “${config.db.database}”.`);
    await purgeExpiredCache();
  } else {
    console.warn(
      `MySQL is not reachable at ${config.db.host}:${config.db.port}. ` +
        'Start the database and run npm run db:migrate.',
    );
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received. Shutting down…`);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      setTimeout(resolve, 5000).unref();
    });
    await Promise.allSettled([shutdownOcr(), pool.end()]);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

start().catch((error: unknown) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
