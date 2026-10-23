import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { execute, queryOne, queryRows, pool, type Queryable } from '../../db/pool.js';
import type {
  BookSummary,
  CatalogEntry,
  CatalogFilters,
  CatalogItem,
  CatalogList,
  CollectionSummary,
  ItemFormat,
  ItemInput,
  ItemStatus,
  PhysicalCondition,
} from '../../types/models.js';
import { cleanIsbn, normalizeIsbn } from '../../utils/isbn.js';
import { generateItemCode, newId } from '../../utils/ids.js';

const SEP = '\u001f';

const ITEM_COLUMNS = `
  ci.id, ci.book_id, ci.item_code, ci.accession_number, ci.acquisition_date,
  ci.acquisition_source, ci.purchase_price, ci.currency, ci.shelf_location,
  ci.collection_id, ci.physical_condition, ci.format, ci.item_status, ci.notes,
  ci.created_at, ci.updated_at,
  c.name AS collection_name, c.color AS collection_color,
  (SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '${SEP}')
     FROM item_tags it JOIN tags t ON t.id = it.tag_id
     WHERE it.item_id = ci.id) AS tag_names
`;

const BOOK_COLUMNS = `
  b.id AS book_id_value, b.title AS book_title, b.subtitle AS book_subtitle,
  b.publisher AS book_publisher, b.publication_date AS book_publication_date,
  b.publication_year AS book_publication_year, b.edition AS book_edition,
  b.language AS book_language, b.page_count AS book_page_count,
  b.isbn10 AS book_isbn10, b.isbn13 AS book_isbn13,
  b.series_title AS book_series_title, b.series_volume AS book_series_volume,
  b.cover_image_url AS book_cover_image_url, b.cover_image_source AS book_cover_image_source,
  b.metadata_source AS book_metadata_source, b.created_at AS book_created_at,
  (SELECT GROUP_CONCAT(a.name ORDER BY ba.position SEPARATOR '${SEP}')
     FROM book_authors ba JOIN authors a ON a.id = ba.author_id
     WHERE ba.book_id = b.id) AS author_names,
  (SELECT COUNT(*) FROM catalog_items ci_count WHERE ci_count.book_id = b.id) AS copy_count
`;

const CATALOG_SELECT = `${ITEM_COLUMNS}, ${BOOK_COLUMNS}`;

interface CatalogRow extends RowDataPacket {
  id: string;
  book_id: string;
  item_code: string;
  accession_number: string | null;
  acquisition_date: string | null;
  acquisition_source: string | null;
  purchase_price: number | null;
  currency: string | null;
  shelf_location: string | null;
  collection_id: string | null;
  physical_condition: string | null;
  format: 'physical' | 'digital';
  item_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  collection_name: string | null;
  collection_color: string | null;
  tag_names: string | null;
  book_id_value: string;
  book_title: string;
  book_subtitle: string | null;
  book_publisher: string | null;
  book_publication_date: string | null;
  book_publication_year: number | null;
  book_edition: string | null;
  book_language: string | null;
  book_page_count: number | null;
  book_isbn10: string | null;
  book_isbn13: string | null;
  book_series_title: string | null;
  book_series_volume: string | null;
  book_cover_image_url: string | null;
  book_cover_image_source: string | null;
  book_metadata_source: string | null;
  book_created_at: string;
  author_names: string | null;
  copy_count: number;
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(SEP)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapBookSummary(row: CatalogRow): BookSummary {
  return {
    id: row.book_id_value,
    title: row.book_title,
    subtitle: row.book_subtitle,
    authors: parseList(row.author_names),
    isbn10: row.book_isbn10,
    isbn13: row.book_isbn13,
    publisher: row.book_publisher,
    publicationDate: row.book_publication_date,
    publicationYear: row.book_publication_year !== null ? Number(row.book_publication_year) : null,
    edition: row.book_edition,
    language: row.book_language,
    pageCount: row.book_page_count !== null ? Number(row.book_page_count) : null,
    seriesTitle: row.book_series_title,
    seriesVolume: row.book_series_volume,
    coverImageUrl: row.book_cover_image_url,
    coverImageSource: row.book_cover_image_source,
    metadataSource: row.book_metadata_source,
    createdAt: row.book_created_at,
  };
}

function mapCatalogRow(row: CatalogRow): CatalogEntry {
  const collection: CollectionSummary | null =
    row.collection_id && row.collection_name
      ? {
          id: row.collection_id,
          name: row.collection_name,
          color: row.collection_color ?? '#2C5D48',
        }
      : null;

  return {
    id: row.id,
    bookId: row.book_id,
    itemCode: row.item_code,
    accessionNumber: row.accession_number,
    acquisitionDate: row.acquisition_date,
    acquisitionSource: row.acquisition_source,
    purchasePrice: row.purchase_price !== null ? Number(row.purchase_price) : null,
    currency: row.currency,
    shelfLocation: row.shelf_location,
    collectionId: row.collection_id,
    physicalCondition: row.physical_condition,
    format: row.format,
    itemStatus: row.item_status,
    notes: row.notes,
    tags: parseList(row.tag_names),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    book: mapBookSummary(row),
    collection,
    copyCount: Number(row.copy_count),
  };
}

function mapItemRow(row: CatalogRow): CatalogItem {
  const entry = mapCatalogRow(row);
  const { book, collection, copyCount, ...item } = entry;
  void book;
  void collection;
  void copyCount;
  return item;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export interface WhereResult {
  sql: string;
  params: unknown[];
}

export function buildCatalogWhere(filters: CatalogFilters): WhereResult {
  const clauses: string[] = ['1 = 1'];
  const params: unknown[] = [];

  if (filters.collectionId) {
    if (filters.collectionId === 'uncategorized') {
      clauses.push('ci.collection_id IS NULL');
    } else {
      clauses.push('ci.collection_id = ?');
      params.push(filters.collectionId);
    }
  }

  if (filters.format) {
    clauses.push('ci.format = ?');
    params.push(filters.format);
  }
  if (filters.condition) {
    clauses.push('ci.physical_condition = ?');
    params.push(filters.condition);
  }
  if (filters.status) {
    clauses.push('ci.item_status = ?');
    params.push(filters.status);
  }
  if (filters.language) {
    clauses.push('b.language = ?');
    params.push(filters.language);
  }
  if (filters.publisher) {
    clauses.push('b.publisher = ?');
    params.push(filters.publisher);
  }
  if (filters.yearFrom) {
    clauses.push('b.publication_year >= ?');
    params.push(filters.yearFrom);
  }
  if (filters.yearTo) {
    clauses.push('b.publication_year <= ?');
    params.push(filters.yearTo);
  }
  if (filters.missingCover) {
    clauses.push("(b.cover_image_url IS NULL OR b.cover_image_url = '')");
  }
  if (filters.missingMetadata) {
    clauses.push(`(
      (b.isbn13 IS NULL AND b.isbn10 IS NULL)
      OR b.publisher IS NULL
      OR b.publication_date IS NULL
      OR NOT EXISTS (SELECT 1 FROM book_authors ba_meta WHERE ba_meta.book_id = b.id)
    )`);
  }
  if (filters.addedFrom) {
    clauses.push('ci.created_at >= ?');
    params.push(filters.addedFrom);
  }
  if (filters.addedTo) {
    clauses.push('ci.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.addedTo);
  }

  const q = filters.q?.trim();
  if (q) {
    const cleaned = cleanIsbn(q);
    const isbnLike = /^(?:\d{9}[\dX]|\d{13})$/i.test(cleaned);
    const normalized = normalizeIsbn(cleaned);

    if (isbnLike || normalized.valid) {
      const isbnParams: unknown[] = [];
      const isbnClauses: string[] = [];
      if (normalized.isbn13) {
        isbnClauses.push('b.isbn13 = ?');
        isbnParams.push(normalized.isbn13);
      }
      if (normalized.isbn10) {
        isbnClauses.push('b.isbn10 = ?');
        isbnParams.push(normalized.isbn10);
      }
      if (cleaned !== q) {
        isbnClauses.push('b.isbn10 = ?', 'b.isbn13 = ?');
        isbnParams.push(cleaned, cleaned);
      }
      isbnClauses.push('ci.item_code = ?', 'ci.accession_number = ?');
      isbnParams.push(q, q);
      clauses.push(`(${isbnClauses.join(' OR ')})`);
      params.push(...isbnParams);
    } else {
      const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
      for (const token of tokens) {
        clauses.push(`(
          b.title LIKE ? OR b.subtitle LIKE ? OR b.publisher LIKE ? OR b.series_title LIKE ?
          OR b.edition LIKE ?
          OR EXISTS (SELECT 1 FROM book_authors ba_q JOIN authors a_q ON a_q.id = ba_q.author_id
                     WHERE ba_q.book_id = b.id AND a_q.name LIKE ?)
          OR EXISTS (SELECT 1 FROM book_subjects bs_q JOIN subjects s_q ON s_q.id = bs_q.subject_id
                     WHERE bs_q.book_id = b.id AND s_q.name LIKE ?)
          OR EXISTS (SELECT 1 FROM item_tags it_q JOIN tags t_q ON t_q.id = it_q.tag_id
                     WHERE it_q.item_id = ci.id AND t_q.name LIKE ?)
          OR c.name LIKE ? OR ci.item_code LIKE ? OR ci.accession_number LIKE ?
        )`);
        const like = `%${escapeLike(token)}%`;
        params.push(like, like, like, like, like, like, like, like, like, like, like);
      }
    }
  }

  return { sql: clauses.join(' AND '), params };
}

const SORT_COLUMNS: Record<string, string> = {
  title: 'b.title',
  author: 'author_names',
  publicationDate: 'b.publication_year',
  dateAdded: 'ci.created_at',
  publisher: 'b.publisher',
  itemId: 'ci.item_code',
  accessionNumber: 'ci.accession_number',
};

export async function listCatalog(
  filters: CatalogFilters,
  options: { selectedIds?: string[]; overridePageSize?: number } = {},
): Promise<CatalogList> {
  const where = buildCatalogWhere(filters);
  const params = [...where.params];

  let whereSql = where.sql;
  if (options.selectedIds && options.selectedIds.length > 0) {
    const placeholders = options.selectedIds.map(() => '?').join(', ');
    whereSql += ` AND ci.id IN (${placeholders})`;
    params.push(...options.selectedIds);
  }

  const page = filters.page ?? 1;
  const pageSize = options.overridePageSize ?? Math.min(filters.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;
  const sortColumn = SORT_COLUMNS[filters.sort ?? 'dateAdded'] ?? SORT_COLUMNS.dateAdded;
  const order = filters.order === 'asc' ? 'ASC' : 'DESC';

  const countRow = await queryOne<RowDataPacket & { total: number }>(
    pool,
    `SELECT COUNT(*) AS total
     FROM catalog_items ci
     JOIN books b ON b.id = ci.book_id
     LEFT JOIN collections c ON c.id = ci.collection_id
     WHERE ${whereSql}`,
    params,
  );

  const rows = await queryRows<CatalogRow>(
    pool,
    `SELECT ${CATALOG_SELECT}
     FROM catalog_items ci
     JOIN books b ON b.id = ci.book_id
     LEFT JOIN collections c ON c.id = ci.collection_id
     WHERE ${whereSql}
     ORDER BY ${sortColumn} ${order}, ci.id ${order}
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const total = Number(countRow?.total ?? 0);
  return {
    data: rows.map(mapCatalogRow),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

export async function listCatalogForExport(
  filters: CatalogFilters,
  selectedIds?: string[],
): Promise<CatalogEntry[]> {
  const result = await listCatalog(
    { ...filters, page: 1, pageSize: 50_000 },
    { selectedIds, overridePageSize: 50_000 },
  );
  return result.data;
}

interface ItemWrite extends ItemInput {
  id: string;
  bookId: string;
  itemCode: string;
  collectionId: string | null;
  physicalCondition: PhysicalCondition | null;
  format: ItemFormat;
  itemStatus: ItemStatus;
  tags: string[];
  purchasePrice: number | null;
  currency: string | null;
}

async function upsertTag(connection: PoolConnection, name: string): Promise<number> {
  const result = await execute(
    connection,
    `INSERT INTO tags (name) VALUES (?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [name],
  );
  return result.insertId;
}

async function replaceItemTags(
  connection: PoolConnection,
  itemId: string,
  tags: string[],
): Promise<void> {
  await execute(connection, 'DELETE FROM item_tags WHERE item_id = ?', [itemId]);
  const unique = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  for (const tag of unique) {
    const tagId = await upsertTag(connection, tag);
    await execute(connection, 'INSERT IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', [
      itemId,
      tagId,
    ]);
  }
}

async function uniqueItemCode(connection: PoolConnection): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateItemCode();
    const existing = await queryOne<RowDataPacket>(connection, 'SELECT 1 FROM catalog_items WHERE item_code = ?', [code]);
    if (!existing) return code;
  }
  return `BIB-${Date.now().toString(36).toUpperCase()}`;
}

function writeParams(data: ItemWrite): unknown[] {
  return [
    data.bookId,
    data.itemCode,
    data.accessionNumber ?? null,
    data.acquisitionDate ?? null,
    data.acquisitionSource ?? null,
    data.purchasePrice ?? null,
    data.currency ?? null,
    data.shelfLocation ?? null,
    data.collectionId ?? null,
    data.physicalCondition ?? null,
    data.format,
    data.itemStatus,
    data.notes ?? null,
  ];
}

export async function insertItem(
  connection: PoolConnection,
  input: Omit<ItemWrite, 'id' | 'itemCode'>,
): Promise<CatalogItem> {
  const id = newId();
  const itemCode = await uniqueItemCode(connection);
  const data: ItemWrite = { ...input, id, itemCode };
  await execute(
    connection,
    `INSERT INTO catalog_items (
       id, book_id, item_code, accession_number, acquisition_date, acquisition_source,
       purchase_price, currency, shelf_location, collection_id, physical_condition,
       format, item_status, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, ...writeParams(data)],
  );
  await replaceItemTags(connection, id, data.tags);
  return {
    id,
    bookId: data.bookId,
    itemCode,
    accessionNumber: data.accessionNumber ?? null,
    acquisitionDate: data.acquisitionDate ?? null,
    acquisitionSource: data.acquisitionSource ?? null,
    purchasePrice: data.purchasePrice ?? null,
    currency: data.currency ?? null,
    shelfLocation: data.shelfLocation ?? null,
    collectionId: data.collectionId ?? null,
    physicalCondition: data.physicalCondition ?? null,
    format: data.format,
    itemStatus: data.itemStatus,
    notes: data.notes ?? null,
    tags: data.tags,
    createdAt: '',
    updatedAt: '',
  };
}

export async function updateItemRecord(
  connection: PoolConnection,
  data: Omit<ItemWrite, 'id' | 'itemCode'> & { id: string; itemCode: string },
): Promise<void> {
  await execute(
    connection,
    `UPDATE catalog_items SET
       book_id = ?, item_code = ?, accession_number = ?, acquisition_date = ?,
       acquisition_source = ?, purchase_price = ?, currency = ?, shelf_location = ?,
       collection_id = ?, physical_condition = ?, format = ?, item_status = ?, notes = ?
     WHERE id = ?`,
    [...writeParams(data as ItemWrite), data.id],
  );
  await replaceItemTags(connection, data.id, data.tags);
}

export async function getItem(id: string, target: Queryable = pool): Promise<CatalogEntry | null> {
  const row = await queryOne<CatalogRow>(
    target,
    `SELECT ${CATALOG_SELECT}
     FROM catalog_items ci
     JOIN books b ON b.id = ci.book_id
     LEFT JOIN collections c ON c.id = ci.collection_id
     WHERE ci.id = ?`,
    [id],
  );
  return row ? mapCatalogRow(row) : null;
}

export async function getItemsForBook(bookId: string): Promise<CatalogEntry[]> {
  const rows = await queryRows<CatalogRow>(
    pool,
    `SELECT ${CATALOG_SELECT}
     FROM catalog_items ci
     JOIN books b ON b.id = ci.book_id
     LEFT JOIN collections c ON c.id = ci.collection_id
     WHERE ci.book_id = ?
     ORDER BY ci.created_at ASC, ci.id ASC`,
    [bookId],
  );
  return rows.map(mapCatalogRow);
}

export async function deleteItemRecord(connection: PoolConnection, id: string): Promise<void> {
  await execute(connection, 'DELETE FROM catalog_items WHERE id = ?', [id]);
}

export async function getFilterOptions(): Promise<{
  languages: string[];
  publishers: string[];
  years: number[];
  conditions: string[];
  statuses: string[];
  formats: string[];
}> {
  const [languages, publishers, years, conditions, statuses, formats] = await Promise.all([
    queryRows<RowDataPacket & { value: string }>(
      pool,
      "SELECT DISTINCT language AS value FROM books WHERE language IS NOT NULL AND language <> '' ORDER BY language LIMIT 200",
    ),
    queryRows<RowDataPacket & { value: string }>(
      pool,
      "SELECT DISTINCT publisher AS value FROM books WHERE publisher IS NOT NULL AND publisher <> '' ORDER BY publisher LIMIT 200",
    ),
    queryRows<RowDataPacket & { value: number }>(
      pool,
      'SELECT DISTINCT publication_year AS value FROM books WHERE publication_year IS NOT NULL ORDER BY publication_year DESC',
    ),
    queryRows<RowDataPacket & { value: string }>(
      pool,
      'SELECT DISTINCT physical_condition AS value FROM catalog_items WHERE physical_condition IS NOT NULL ORDER BY physical_condition',
    ),
    queryRows<RowDataPacket & { value: string }>(
      pool,
      'SELECT DISTINCT item_status AS value FROM catalog_items ORDER BY item_status',
    ),
    queryRows<RowDataPacket & { value: string }>(
      pool,
      'SELECT DISTINCT format AS value FROM catalog_items ORDER BY format',
    ),
  ]);

  return {
    languages: languages.map((row) => row.value),
    publishers: publishers.map((row) => row.value),
    years: years.map((row) => Number(row.value)),
    conditions: conditions.map((row) => row.value),
    statuses: statuses.map((row) => row.value),
    formats: formats.map((row) => row.value),
  };
}
