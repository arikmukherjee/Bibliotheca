import type { z } from 'zod';
import { pool } from '../../db/pool.js';
import type { collectionSchema, updateCollectionSchema } from '../../schemas/bookSchemas.js';
import type { Collection, CollectionWithCount } from '../../types/models.js';
import { logAudit } from '../../utils/audit.js';
import { conflict, notFound } from '../../utils/errors.js';
import { newId } from '../../utils/ids.js';
import {
  countItemsInCollection,
  deleteCollection,
  findCollectionByName,
  insertCollection,
  listCollections,
  updateCollection,
} from './collectionRepository.js';

type CollectionInput = z.infer<typeof collectionSchema>;
type CollectionUpdate = z.infer<typeof updateCollectionSchema>;

export async function getCollections(): Promise<CollectionWithCount[]> {
  return listCollections();
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  const existing = await findCollectionByName(input.name);
  if (existing) {
    throw conflict('A collection with that name already exists.', { collection: existing });
  }
  const collection = await insertCollection({
    id: newId(),
    name: input.name,
    description: input.description ?? null,
    color: input.color,
  });
  await logAudit(pool, {
    action: 'collection.created',
    entityType: 'collection',
    entityId: collection.id,
    summary: `Created collection “${collection.name}”`,
  });
  return collection;
}

export async function editCollection(
  id: string,
  input: CollectionUpdate,
): Promise<Collection> {
  const existing = await findCollectionByName(input.name ?? '');
  if (existing && existing.id !== id) {
    throw conflict('A collection with that name already exists.');
  }
  const collection = await updateCollection(id, {
    name: input.name,
    description: input.description,
    color: input.color,
  });
  if (!collection) notFound('Collection not found.');
  await logAudit(pool, {
    action: 'collection.updated',
    entityType: 'collection',
    entityId: id,
    summary: `Updated collection “${collection.name}”`,
  });
  return collection;
}

export async function removeCollection(
  id: string,
): Promise<{ collection: Collection; itemsUncategorized: number }> {
  const collections = await listCollections();
  const collection = collections.find((entry) => entry.id === id);
  if (!collection) notFound('Collection not found.');
  const affected = await countItemsInCollection(id);
  await deleteCollection(id);
  await logAudit(pool, {
    action: 'collection.deleted',
    entityType: 'collection',
    entityId: id,
    summary: `Deleted collection “${collection.name}”`,
    details: { itemsUncategorized: affected },
  });
  return { collection, itemsUncategorized: affected };
}
