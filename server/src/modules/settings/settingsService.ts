import type { RowDataPacket } from 'mysql2/promise';
import { config } from '../../config.js';
import { queryOne, queryRows, pool, execute } from '../../db/pool.js';
import type { z } from 'zod';
import type { settingsSchema } from '../../schemas/bookSchemas.js';
import { logAudit } from '../../utils/audit.js';
import { getAllSettings, saveSettings } from './settingsRepository.js';

type SettingsInput = z.infer<typeof settingsSchema>;

export interface SettingsPayload {
  values: Record<string, string>;
  providers: {
    googleBooks: { configured: boolean; mode: 'api_key' | 'public_quota' };
    openLibrary: { configured: boolean; mode: 'public_api' };
    ocr: { enabled: boolean };
  };
  cache: { entries: number; lastFetchedAt: string | null };
  library: { bibliographicRecords: number; catalogItems: number };
}

export async function getSettingsPayload(): Promise<SettingsPayload> {
  const values = await getAllSettings();
  const [cacheRow, counts] = await Promise.all([
    queryOne<
      RowDataPacket & { count: number; last_fetched_at: string | null }
    >(
      pool,
      `SELECT COUNT(*) AS count, MAX(fetched_at) AS last_fetched_at
       FROM metadata_lookup_cache WHERE expires_at > UTC_TIMESTAMP()`,
    ),
    queryRows<RowDataPacket & { books: number; items: number }>(
      pool,
      `SELECT
         (SELECT COUNT(*) FROM books) AS books,
         (SELECT COUNT(*) FROM catalog_items) AS items`,
    ),
  ]);

  const row = counts[0];
  return {
    values,
    providers: {
      googleBooks: {
        configured: Boolean(config.googleBooksApiKey),
        mode: config.googleBooksApiKey ? 'api_key' : 'public_quota',
      },
      openLibrary: { configured: true, mode: 'public_api' },
      ocr: { enabled: config.ocrEnabled },
    },
    cache: {
      entries: Number(cacheRow?.count ?? 0),
      lastFetchedAt: cacheRow?.last_fetched_at ?? null,
    },
    library: {
      bibliographicRecords: Number(row?.books ?? 0),
      catalogItems: Number(row?.items ?? 0),
    },
  };
}

export async function updateSettings(input: SettingsInput): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  if (input.library_name !== undefined) values.library_name = input.library_name;
  if (input.default_currency !== undefined) values.default_currency = input.default_currency;
  if (input.default_format !== undefined) values.default_format = input.default_format;
  if (input.default_condition !== undefined) values.default_condition = input.default_condition;

  if (Object.keys(values).length === 0) return getAllSettings();

  await saveSettings(values);
  await logAudit(pool, {
    action: 'settings.updated',
    entityType: 'settings',
    summary: 'Library settings updated',
    details: { keys: Object.keys(values) },
  });
  return getAllSettings();
}

export async function clearMetadataCache(): Promise<number> {
  const result = await execute(pool, 'DELETE FROM metadata_lookup_cache');
  await logAudit(pool, {
    action: 'settings.cache_cleared',
    entityType: 'settings',
    summary: 'Metadata cache cleared',
    details: { removed: result.affectedRows },
  });
  return result.affectedRows;
}
