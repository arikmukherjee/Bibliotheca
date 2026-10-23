import type { RowDataPacket } from 'mysql2/promise';
import { execute, queryRows, pool } from '../../db/pool.js';

export const SETTING_DEFAULTS: Record<string, string> = {
  library_name: 'My Library',
  default_currency: 'USD',
  default_format: 'physical',
  default_condition: 'good',
};

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await queryRows<RowDataPacket & { setting_key: string; setting_value: string | null }>(
    pool,
    'SELECT setting_key, setting_value FROM settings',
  );
  const values: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.setting_value !== null) values[row.setting_key] = row.setting_value;
  }
  return values;
}

export async function saveSettings(values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await execute(
      pool,
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value],
    );
  }
}
