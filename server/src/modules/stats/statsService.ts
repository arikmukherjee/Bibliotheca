import type { RowDataPacket } from 'mysql2/promise';
import { pool, queryOne, queryRows } from '../../db/pool.js';
import type {
  BookSummary,
  CatalogEntry,
  CollectionWithCount,
} from '../../types/models.js';
import { recentActivity } from '../../utils/audit.js';
import { BOOK_SELECT, mapBookRow, toBookSummary, type BookRow } from '../books/bookRepository.js';
import { listCatalog } from '../catalog/itemRepository.js';
import { listCollections } from '../collections/collectionRepository.js';

const MISSING_METADATA_SQL = `(
  (b.isbn13 IS NULL AND b.isbn10 IS NULL)
  OR b.publisher IS NULL
  OR b.publication_date IS NULL
  OR NOT EXISTS (SELECT 1 FROM book_authors ba_meta WHERE ba_meta.book_id = b.id)
)`;

const MISSING_COVER_SQL = "(b.cover_image_url IS NULL OR b.cover_image_url = '')";

const ORPHANED_SQL = `NOT EXISTS (
  SELECT 1 FROM catalog_items ci_orphan WHERE ci_orphan.book_id = b.id
)`;

interface CountsRow extends RowDataPacket {
  books: number;
  items: number;
  collections: number;
  physical_items: number;
  digital_items: number;
  missing_metadata: number;
  missing_cover: number;
  orphaned_books: number;
}

interface AttentionRow extends BookRow {
  item_count: number;
}

export interface AttentionBook {
  book: BookSummary;
  itemCount: number;
}

export interface DashboardStats {
  totals: {
    books: number;
    items: number;
    collections: number;
    physical: number;
    digital: number;
    missingMetadata: number;
    missingCover: number;
    orphanedBooks: number;
  };
  health: {
    completeBooks: number;
    percentage: number;
  };
  collections: CollectionWithCount[];
  recentItems: CatalogEntry[];
  needsAttention: {
    missingMetadata: AttentionBook[];
    missingCover: AttentionBook[];
    orphanedBooks: AttentionBook[];
  };
  activity: Array<{
    id: number;
    action: string;
    summary: string;
    entityType: string;
    entityId: string | null;
    createdAt: string;
    details: unknown;
  }>;
}

async function attentionBooks(condition: string, limit = 5): Promise<AttentionBook[]> {
  const rows = await queryRows<AttentionRow>(
    pool,
    `SELECT ${BOOK_SELECT},
       (SELECT COUNT(*) FROM catalog_items ci WHERE ci.book_id = b.id) AS item_count
     FROM books b
     WHERE ${condition}
     ORDER BY b.created_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    book: toBookSummary(mapBookRow(row)),
    itemCount: Number(row.item_count),
  }));
}

function parseDetails(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const counts = await queryOne<CountsRow>(
    pool,
    `SELECT
       (SELECT COUNT(*) FROM books) AS books,
       (SELECT COUNT(*) FROM catalog_items) AS items,
       (SELECT COUNT(*) FROM collections) AS collections,
       (SELECT COUNT(*) FROM catalog_items WHERE format = 'physical') AS physical_items,
       (SELECT COUNT(*) FROM catalog_items WHERE format = 'digital') AS digital_items,
       (SELECT COUNT(*) FROM books b WHERE ${MISSING_METADATA_SQL}) AS missing_metadata,
       (SELECT COUNT(*) FROM books b WHERE ${MISSING_COVER_SQL}) AS missing_cover,
       (SELECT COUNT(*) FROM books b WHERE ${ORPHANED_SQL}) AS orphaned_books`,
  );

  const [collections, catalogPage, activity, missingMetadata, missingCover, orphanedBooks] =
    await Promise.all([
      listCollections(),
      listCatalog({ page: 1, pageSize: 6, sort: 'dateAdded', order: 'desc' }),
      recentActivity(8),
      attentionBooks(MISSING_METADATA_SQL),
      attentionBooks(MISSING_COVER_SQL),
      attentionBooks(ORPHANED_SQL),
    ]);

  const books = Number(counts?.books ?? 0);
  const missingMetadataCount = Number(counts?.missing_metadata ?? 0);
  const completeBooks = Math.max(0, books - missingMetadataCount);

  return {
    totals: {
      books,
      items: Number(counts?.items ?? 0),
      collections: Number(counts?.collections ?? 0),
      physical: Number(counts?.physical_items ?? 0),
      digital: Number(counts?.digital_items ?? 0),
      missingMetadata: missingMetadataCount,
      missingCover: Number(counts?.missing_cover ?? 0),
      orphanedBooks: Number(counts?.orphaned_books ?? 0),
    },
    health: {
      completeBooks,
      percentage: books === 0 ? 100 : Math.round((completeBooks / books) * 100),
    },
    collections,
    recentItems: catalogPage.data,
    needsAttention: {
      missingMetadata,
      missingCover,
      orphanedBooks,
    },
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      summary: row.summary,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
      details: parseDetails(row.details),
    })),
  };
}
