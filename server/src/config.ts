import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export const serverRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env'), override: false });

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3308),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1).default('bibliotheca'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  GOOGLE_BOOKS_API_KEY: z.string().optional().default(''),
  METADATA_CACHE_TTL_HOURS: z.coerce.number().positive().default(168),
  METADATA_TIMEOUT_MS: z.coerce.number().int().positive().default(9000),
  OCR_ENABLED: booleanFromEnv.default('true'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(12),
  UPLOAD_DIR: z.string().default('storage'),
  IDENTIFY_RATE_LIMIT: z.coerce.number().int().positive().default(15),
  EXPORT_RATE_LIMIT: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  clientOrigins: env.CLIENT_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: env.DB_CONNECTION_LIMIT,
  },
  googleBooksApiKey: env.GOOGLE_BOOKS_API_KEY,
  metadata: {
    cacheTtlHours: env.METADATA_CACHE_TTL_HOURS,
    timeoutMs: env.METADATA_TIMEOUT_MS,
  },
  ocrEnabled: env.OCR_ENABLED,
  maxUploadBytes: Math.round(env.MAX_UPLOAD_MB * 1024 * 1024),
  maxUploadMb: env.MAX_UPLOAD_MB,
  storageRoot: path.resolve(serverRoot, env.UPLOAD_DIR),
  rootDir: repoRoot,
  clientDist: path.resolve(repoRoot, 'client', 'dist'),
  identifyRateLimit: env.IDENTIFY_RATE_LIMIT,
  exportRateLimit: env.EXPORT_RATE_LIMIT,
};

export const storageDirs = {
  root: config.storageRoot,
  covers: path.join(config.storageRoot, 'covers'),
  temp: path.join(config.storageRoot, 'temp'),
  tesseract: path.join(config.storageRoot, 'tesseract'),
};
