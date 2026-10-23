import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { execute, queryOne, queryRows, pool, type Queryable } from '../../db/pool.js';
import type { Book, BookSummary, DuplicateCandidate } from '../../types/models.js';
import { bestAuthorSimilarity, similarity } from '../../utils/text.js';

const SEP = '\u001f';

export const BOOK_SELECT = `
  b.id, b.title, b.subtitle, b.publisher, b.publication_date, b.publication_year,
  b.edition, b.language, b.page_count, b.description, b.table_of_contents,
  b.series_title, b.series_volume, b.isbn10, b.isbn13, b.cover_image_url,
  b.cover_image_source, b.metadata_source, b.external_reference, b.external_url,
  b.original_publication_date, b.field_sources, b.metadata_retrieved_at,
  b.created_at, b.updated_at,
  (SELECT GROUP_CONCAT(a.name ORDER BY ba.position SEPARATOR '${SEP}')
     FROM book_authors ba JOIN authors a ON a.id = ba.author_id
     WHERE ba.book_id = b.id) AS author_names,
  (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR '${SEP}')
     FROM book_subjects bs JOIN subjects s ON s.id = bs.subject_id
     WHERE bs.book_id = b.id) AS subject_names
`;

export interface BookRow extends RowDataPacket {
  id: string;
  title: string;
  subtitle: string | null;
  publisher: string | null;
  publication_date: string | null;
  publication_year: number | null;
  edition: string | null;
  language: string | null;
  page_count: number | null;
  description: string | null;
  table_of_contents: string | null;
  series_title: string | null;
  series_volume: string | null;
  isbn10: string | null;
  isbn13: string | null;
  cover_image_url: string | null;
  cover_image_source: string | null;
  metadata_source: string | null;
  external_reference: string | null;
  external_url: string | null;
  original_publication_date: string | null;
  field_sources: unknown;
  metadata_retrieved_at: string | null;
  created_at: string;
  updated_at: string;
  author_names: string | null;
  subject_names: string | null;
  item_count?: number;
}

interface DuplicateRow extends BookRow {
  item_count: number;
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(SEP)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFieldSources(value: unknown): Record<string, string> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, string>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function mapBookRow(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    authors: parseList(row.author_names),
    isbn10: row.isbn10,
    isbn13: row.isbn13,
    publisher: row.publisher,
    publicationDate: row.publication_date,
    publicationYear: row.publication_year !== null ? Number(row.publication_year) : null,
    edition: row.edition,
    language: row.language,
    pageCount: row.page_count !== null ? Number(row.page_count) : null,
    description: row.description,
    tableOfContents: row.table_of_contents,
    seriesTitle: row.series_title,
    seriesVolume: row.series_volume,
    subjects: parseList(row.subject_names),
    coverImageUrl: row.cover_image_url,
    coverImageSource: row.cover_image_source,
    metadataSource: row.metadata_source,
    externalReference: row.external_reference,
    externalUrl: row.external_url,
    originalPublicationDate: row.original_publication_date,
    fieldSources: parseFieldSources(row.field_sources),
    metadataRetrievedAt: row.metadata_retrieved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toBookSummary(book: Book): BookSummary {
  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors,
    isbn10: book.isbn10,
    isbn13: book.isbn13,
    publisher: book.publisher,
    publicationDate: book.publicationDate,
    publicationYear: book.publicationYear,
    edition: book.edition,
    language: book.language,
    pageCount: book.pageCount,
    seriesTitle: book.seriesTitle,
    seriesVolume: book.seriesVolume,
    coverImageUrl: book.coverImageUrl,
    coverImageSource: book.coverImageSource,
    metadataSource: book.metadataSource,
    createdAt: book.createdAt,
  };
}

export interface BookWrite {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn10: string | null;
  isbn13: string | null;
  publisher: string | null;
  publicationDate: string | null;
  publicationYear: number | null;
  edition: string | null;
  language: string | null;
  pageCount: number | null;
  description: string | null;
  tableOfContents: string | null;
  seriesTitle: string | null;
  seriesVolume: string | null;
  subjects: string[];
  coverImageUrl: string | null;
  coverImageSource: string | null;
  metadataSource: string | null;
  externalReference: string | null;
  externalUrl: string | null;
  originalPublicationDate: string | null;
  fieldSources: Record<string, string> | null;
  metadataRetrievedAt: string | null;
}

async function upsertName(
  connection: Queryable,
  table: 'authors' | 'subjects',
  name: string,
): Promise<number> {
  const result = await execute(
    connection,
    `INSERT INTO ${table} (name) VALUES (?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [name],
  );
  return result.insertId;
}

async function replaceBookAuthors(
  connection: Queryable,
  bookId: string,
  authors: string[],
): Promise<void> {
  await execute(connection, 'DELETE FROM book_authors WHERE book_id = ?', [bookId]);
  for (const [position, author] of authors.entries()) {
    if (!author.trim()) continue;
    const authorId = await upsertName(connection, 'authors', author.trim());
    await execute(
      connection,
      'INSERT INTO book_authors (book_id, author_id, position) VALUES (?, ?, ?)',
      [bookId, authorId, position],
    );
  }
}

async function replaceBookSubjects(
  connection: Queryable,
  bookId: string,
  subjects: string[],
): Promise<void> {
  await execute(connection, 'DELETE FROM book_subjects WHERE book_id = ?', [bookId]);
  for (const subject of subjects) {
    if (!subject.trim()) continue;
    const subjectId = await upsertName(connection, 'subjects', subject.trim());
    await execute(
      connection,
      'INSERT IGNORE INTO book_subjects (book_id, subject_id) VALUES (?, ?)',
      [bookId, subjectId],
    );
  }
}

export async function insertBook(connection: PoolConnection, data: BookWrite): Promise<void> {
  await execute(
    connection,
    `INSERT INTO books (
       id, title, subtitle, publisher, publication_date, publication_year, edition, language,
       page_count, description, table_of_contents, series_title, series_volume, isbn10, isbn13,
       cover_image_url, cover_image_source, metadata_source, external_reference, external_url,
       original_publication_date, field_sources, metadata_retrieved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      data.title,
      data.subtitle,
      data.publisher,
      data.publicationDate,
      data.publicationYear,
      data.edition,
      data.language,
      data.pageCount,
      data.description,
      data.tableOfContents,
      data.seriesTitle,
      data.seriesVolume,
      data.isbn10,
      data.isbn13,
      data.coverImageUrl,
      data.coverImageSource,
      data.metadataSource,
      data.externalReference,
      data.externalUrl,
      data.originalPublicationDate,
      data.fieldSources ? JSON.stringify(data.fieldSources) : null,
      data.metadataRetrievedAt,
    ],
  );
  await replaceBookAuthors(connection, data.id, data.authors);
  await replaceBookSubjects(connection, data.id, data.subjects);
}

export async function updateBook(
  connection: PoolConnection,
  data: BookWrite,
): Promise<void> {
  await execute(
    connection,
    `UPDATE books SET
       title = ?, subtitle = ?, publisher = ?, publication_date = ?, publication_year = ?,
       edition = ?, language = ?, page_count = ?, description = ?, table_of_contents = ?,
       series_title = ?, series_volume = ?, isbn10 = ?, isbn13 = ?, cover_image_url = ?,
       cover_image_source = ?, metadata_source = ?, external_reference = ?, external_url = ?,
       original_publication_date = ?, field_sources = ?, metadata_retrieved_at = ?
     WHERE id = ?`,
    [
      data.title,
      data.subtitle,
      data.publisher,
      data.publicationDate,
      data.publicationYear,
      data.edition,
      data.language,
      data.pageCount,
      data.description,
      data.tableOfContents,
      data.seriesTitle,
      data.seriesVolume,
      data.isbn10,
      data.isbn13,
      data.coverImageUrl,
      data.coverImageSource,
      data.metadataSource,
      data.externalReference,
      data.externalUrl,
      data.originalPublicationDate,
      data.fieldSources ? JSON.stringify(data.fieldSources) : null,
      data.metadataRetrievedAt,
      data.id,
    ],
  );
  await replaceBookAuthors(connection, data.id, data.authors);
  await replaceBookSubjects(connection, data.id, data.subjects);
}

export async function getBook(id: string, target: Queryable = pool): Promise<Book | null> {
  const row = await queryOne<BookRow>(target, `SELECT ${BOOK_SELECT} FROM books b WHERE b.id = ?`, [id]);
  return row ? mapBookRow(row) : null;
}

export async function findBookByIsbn(
  isbn10: string | null,
  isbn13: string | null,
  excludeBookId?: string,
  target: Queryable = pool,
): Promise<Book | null> {
  if (!isbn10 && !isbn13) return null;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (isbn13) {
    clauses.push('b.isbn13 = ?');
    params.push(isbn13);
  }
  if (isbn10) {
    clauses.push('b.isbn10 = ?');
    params.push(isbn10);
  }
  if (excludeBookId) {
    clauses.push('b.id <> ?');
    params.push(excludeBookId);
  }
  const row = await queryOne<BookRow>(
    target,
    `SELECT ${BOOK_SELECT} FROM books b WHERE (${clauses.join(' OR ')}) LIMIT 1`,
    params,
  );
  return row ? mapBookRow(row) : null;
}

export async function findBooksByIsbns(isbns: string[]): Promise<Map<string, { book: Book; itemCount: number }>> {
  const unique = [...new Set(isbns.filter(Boolean))];
  const result = new Map<string, { book: Book; itemCount: number }>();
  if (unique.length === 0) return result;

  const placeholders = unique.map(() => '?').join(', ');
  const rows = await queryRows<DuplicateRow>(
    pool,
    `SELECT ${BOOK_SELECT},
       (SELECT COUNT(*) FROM catalog_items ci WHERE ci.book_id = b.id) AS item_count
     FROM books b
     WHERE b.isbn13 IN (${placeholders}) OR b.isbn10 IN (${placeholders})`,
    [...unique, ...unique],
  );

  for (const row of rows) {
    const book = mapBookRow(row);
    const match = { book, itemCount: Number(row.item_count) };
    if (book.isbn13) result.set(book.isbn13, match);
    if (book.isbn10) result.set(book.isbn10, match);
  }
  return result;
}

export async function findDuplicates(input: {
  isbn10: string | null;
  isbn13: string | null;
  title?: string | null;
  author?: string | null;
  excludeBookId?: string;
}): Promise<DuplicateCandidate[]> {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (input.isbn10 || input.isbn13) {
    if (input.isbn13) {
      conditions.push('b.isbn13 = ?');
      params.push(input.isbn13);
    }
    if (input.isbn10) {
      conditions.push('b.isbn10 = ?');
      params.push(input.isbn10);
    }
  } else if (input.title) {
    conditions.push('b.title = ?');
    params.push(input.title);
    if (input.author) {
      conditions.push(`EXISTS (
        SELECT 1 FROM book_authors ba2
        JOIN authors a2 ON a2.id = ba2.author_id
        WHERE ba2.book_id = b.id AND a2.name LIKE ?
      )`);
      params.push(`%${input.author}%`);
    }
  } else {
    return [];
  }

  if (input.excludeBookId) {
    conditions.push('b.id <> ?');
    params.push(input.excludeBookId);
  }

  const rows = await queryRows<DuplicateRow>(
    pool,
    `SELECT ${BOOK_SELECT},
       (SELECT COUNT(*) FROM catalog_items ci WHERE ci.book_id = b.id) AS item_count
     FROM books b
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.created_at DESC
     LIMIT 6`,
    params,
  );

  const referenceTitle = input.title ?? '';
  const referenceAuthors = input.author ? [input.author] : [];

  return rows.map((row) => {
    const book = mapBookRow(row);
    const titleSimilarity = referenceTitle ? similarity(book.title, referenceTitle) : 0;
    const authorSimilarity = referenceAuthors.length
      ? bestAuthorSimilarity(book.authors, referenceAuthors)
      : 0;
    const matchReason: DuplicateCandidate['matchReason'] =
      input.isbn10 || input.isbn13 ? 'isbn' : input.author ? 'title_author' : 'title';
    return {
      book: toBookSummary(book),
      itemCount: Number(row.item_count),
      matchReason,
      similarity: matchReason === 'isbn' ? 1 : Math.max(titleSimilarity, authorSimilarity),
    };
  });
}

export async function countItemsForBook(bookId: string, target: Queryable = pool): Promise<number> {
  const row = await queryOne<RowDataPacket & { count: number }>(
    target,
    'SELECT COUNT(*) AS count FROM catalog_items WHERE book_id = ?',
    [bookId],
  );
  return Number(row?.count ?? 0);
}

export async function deleteBookRecord(connection: PoolConnection, id: string): Promise<void> {
  await execute(connection, 'DELETE FROM books WHERE id = ?', [id]);
}
