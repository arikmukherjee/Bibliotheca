import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

async function run(): Promise<void> {
  if (!/^[A-Za-z0-9_]+$/.test(config.db.database)) {
    throw new Error('DB_NAME may only contain letters, numbers and underscores.');
  }

  const migrationsDir = path.join(config.rootDir, 'database', 'migrations');
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(`USE \`${config.db.database}\``);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (version)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [appliedRows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT version FROM schema_migrations',
    );
    const applied = new Set(appliedRows.map((row) => String(row.version)));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`• ${file} (already applied)`);
        continue;
      }
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`→ Applying ${file} ...`);
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      console.log(`✓ ${file}`);
    }

    console.log(`\nDatabase "${config.db.database}" is up to date.`);
  } finally {
    await connection.end();
  }
}

run().catch((error: unknown) => {
  console.error('\nMigration failed:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
