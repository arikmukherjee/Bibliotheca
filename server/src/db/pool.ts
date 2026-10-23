import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { config } from '../config.js';

export const pool: Pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: true,
  supportBigNumbers: true,
  decimalNumbers: true,
});

pool.on('connection', (connection) => {
  connection.query("SET SESSION time_zone = '+00:00'");
});

export type Queryable = Pool | PoolConnection;

export async function queryRows<T extends RowDataPacket>(
  target: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await target.query<T[]>(sql, params);
  return rows;
}

export async function queryOne<T extends RowDataPacket>(
  target: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(target, sql, params);
  return rows[0] ?? null;
}

export async function execute(
  target: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await target.query<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(handler: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
