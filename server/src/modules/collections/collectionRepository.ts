import type { RowDataPacket } from 'mysql2/promise';
import { execute, queryOne, queryRows, pool } from '../../db/pool.js';
import type { Collection, CollectionWithCount } from '../../types/models.js';

interface CollectionRow extends RowDataPacket {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
  book_count?: number;
}

function mapCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCollections(): Promise<CollectionWithCount[]> {
  const rows = await queryRows<CollectionRow>(
    pool,
    `SELECT c.*,
       COUNT(DISTINCT ci.id) AS item_count,
       COUNT(DISTINCT ci.book_id) AS book_count
     FROM collections c
     LEFT JOIN catalog_items ci ON ci.collection_id = c.id
     GROUP BY c.id
     ORDER BY c.name ASC`,
  );
  return rows.map((row) => ({
    ...mapCollection(row),
    itemCount: Number(row.item_count ?? 0),
    bookCount: Number(row.book_count ?? 0),
  }));
}

export async function getCollection(id: string): Promise<Collection | null> {
  const row = await queryOne<CollectionRow>(pool, 'SELECT * FROM collections WHERE id = ?', [id]);
  return row ? mapCollection(row) : null;
}

export async function findCollectionByName(name: string): Promise<Collection | null> {
  const row = await queryOne<CollectionRow>(pool, 'SELECT * FROM collections WHERE name = ?', [name]);
  return row ? mapCollection(row) : null;
}

export async function insertCollection(data: {
  id: string;
  name: string;
  description: string | null;
  color: string;
}): Promise<Collection> {
  await execute(
    pool,
    'INSERT INTO collections (id, name, description, color) VALUES (?, ?, ?, ?)',
    [data.id, data.name, data.description, data.color],
  );
  const collection = await getCollection(data.id);
  if (!collection) throw new Error('Collection was created but could not be read back.');
  return collection;
}

export async function updateCollection(
  id: string,
  data: { name?: string; description?: string | null; color?: string },
): Promise<Collection | null> {
  const fields: string[] = [];
  const params: unknown[] = [];
  if (data.name !== undefined) {
    fields.push('name = ?');
    params.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    params.push(data.description);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    params.push(data.color);
  }
  if (fields.length === 0) return getCollection(id);
  params.push(id);
  await execute(pool, `UPDATE collections SET ${fields.join(', ')} WHERE id = ?`, params);
  return getCollection(id);
}

export async function countItemsInCollection(id: string): Promise<number> {
  const row = await queryOne<RowDataPacket & { count: number }>(
    pool,
    'SELECT COUNT(*) AS count FROM catalog_items WHERE collection_id = ?',
    [id],
  );
  return Number(row?.count ?? 0);
}

export async function deleteCollection(id: string): Promise<void> {
  await execute(pool, 'DELETE FROM collections WHERE id = ?', [id]);
}
