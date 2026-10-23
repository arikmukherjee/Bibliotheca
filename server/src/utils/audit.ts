import type { RowDataPacket } from 'mysql2/promise';
import { execute, queryRows, type Queryable, pool } from '../db/pool.js';

interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
}

export async function logAudit(target: Queryable, input: AuditInput): Promise<void> {
  try {
    await execute(
      target,
      `INSERT INTO audit_logs (action, entity_type, entity_id, summary, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.action,
        input.entityType,
        input.entityId ?? null,
        input.summary.slice(0, 255),
        input.details ? JSON.stringify(input.details) : null,
      ],
    );
  } catch (error) {
    console.warn('Audit log write failed:', error instanceof Error ? error.message : error);
  }
}

export interface AuditRow extends RowDataPacket {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  details: string | null;
  created_at: string;
}

export async function recentActivity(limit = 10): Promise<AuditRow[]> {
  return queryRows<AuditRow>(
    pool,
    `SELECT id, action, entity_type, entity_id, summary, details, created_at
     FROM audit_logs
     ORDER BY id DESC
     LIMIT ?`,
    [limit],
  );
}
