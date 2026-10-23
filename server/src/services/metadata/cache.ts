import type { RowDataPacket } from 'mysql2/promise';
import { config } from '../../config.js';
import { execute, queryOne, pool } from '../../db/pool.js';

interface CacheRow extends RowDataPacket {
  payload: string;
  expires_at: string;
}

function parseMysqlDate(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

async function readCache<T>(key: string): Promise<{ data: T; fresh: boolean } | null> {
  try {
    const row = await queryOne<CacheRow>(
      pool,
      'SELECT payload, expires_at FROM metadata_lookup_cache WHERE cache_key = ?',
      [key],
    );
    if (!row) return null;
    return {
      data: JSON.parse(row.payload) as T,
      fresh: parseMysqlDate(row.expires_at).getTime() > Date.now(),
    };
  } catch (error) {
    console.warn('Metadata cache read failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function writeCache(key: string, provider: string, data: unknown, ttlHours: number): Promise<void> {
  try {
    const ttl = Math.max(1, Math.round(ttlHours));
    await execute(
      pool,
      `INSERT INTO metadata_lookup_cache (cache_key, provider, payload, fetched_at, expires_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))
       ON DUPLICATE KEY UPDATE
         provider = VALUES(provider),
         payload = VALUES(payload),
         fetched_at = VALUES(fetched_at),
         expires_at = VALUES(expires_at)`,
      [key, provider, JSON.stringify(data), ttl],
    );
  } catch (error) {
    console.warn('Metadata cache write failed:', error instanceof Error ? error.message : error);
  }
}

export async function cachedLookup<T>(
  key: string,
  provider: string,
  loader: () => Promise<T>,
  ttlHours = config.metadata.cacheTtlHours,
): Promise<T> {
  const cached = await readCache<T>(key);
  if (cached?.fresh) return cached.data;

  try {
    const data = await loader();
    await writeCache(key, provider, data, ttlHours);
    return data;
  } catch (error) {
    if (cached) {
      console.warn(`Serving stale cached ${provider} data for ${key}.`);
      return cached.data;
    }
    throw error;
  }
}

export async function purgeExpiredCache(): Promise<void> {
  try {
    await execute(pool, 'DELETE FROM metadata_lookup_cache WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 30 DAY');
  } catch (error) {
    console.warn('Metadata cache purge failed:', error instanceof Error ? error.message : error);
  }
}
