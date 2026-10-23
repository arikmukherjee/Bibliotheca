import path from 'node:path';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import type { RowDataPacket } from 'mysql2/promise';
import { execute, pool, queryOne, withTransaction } from '../../db/pool.js';
import type { ItemFormat, ItemStatus, PhysicalCondition } from '../../types/models.js';
import { logAudit } from '../../utils/audit.js';
import { HttpError, notFound } from '../../utils/errors.js';
import { newId } from '../../utils/ids.js';
import { normalizeIsbn } from '../../utils/isbn.js';
import { parseYear } from '../../utils/text.js';
import { insertBook, type BookWrite } from '../books/bookRepository.js';
import { insertItem } from '../catalog/itemRepository.js';
import {
  findCollectionByName,
  insertCollection,
} from '../collections/collectionRepository.js';
import { getAllSettings } from '../settings/settingsRepository.js';

export const IMPORT_FIELDS = [
  'title',
  'subtitle',
  'authors',
  'isbn',
  'isbn10',
  'isbn13',
  'publisher',
  'publicationDate',
  'publicationYear',
  'edition',
  'language',
  'pageCount',
  'description',
  'seriesTitle',
  'seriesVolume',
  'subjects',
  'format',
  'condition',
  'status',
  'collection',
  'shelfLocation',
  'accessionNumber',
  'acquisitionDate',
  'acquisitionSource',
  'purchasePrice',
  'currency',
  'tags',
  'notes',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, string | null>>;

const FIELD_ALIASES: Record<ImportField, string[]> = {
  title: ['title', 'book title', 'book', 'name'],
  subtitle: ['subtitle', 'sub title'],
  authors: ['authors', 'author', 'author(s)', 'writer', 'writers'],
  isbn: ['isbn', 'isbn number', 'isbn code'],
  isbn10: ['isbn10', 'isbn 10', 'isbn-10'],
  isbn13: ['isbn13', 'isbn 13', 'isbn-13', 'ean', 'ean13'],
  publisher: ['publisher', 'published by', 'press'],
  publicationDate: ['publication date', 'published', 'date published', 'publish date', 'year'],
  publicationYear: ['publication year', 'publish year', 'published year', 'year published'],
  edition: ['edition', 'edition name'],
  language: ['language', 'lang'],
  pageCount: ['pages', 'page count', 'number of pages', 'paginations', 'length'],
  description: ['description', 'summary', 'synopsis', 'blurb'],
  seriesTitle: ['series', 'series title', 'series name'],
  seriesVolume: ['series volume', 'volume', 'series number', 'book number'],
  subjects: ['subjects', 'subject', 'genres', 'genre', 'categories', 'category'],
  format: ['format', 'media', 'type'],
  condition: ['condition', 'physical condition', 'state'],
  status: ['status', 'reading status', 'shelf status'],
  collection: ['collection', 'shelf list', 'list', 'category'],
  shelfLocation: ['shelf', 'shelf location', 'location', 'shelf code'],
  accessionNumber: ['accession', 'accession number', 'accession no', 'inventory number'],
  acquisitionDate: ['acquisition date', 'acquired', 'date acquired', 'purchase date'],
  acquisitionSource: ['acquisition source', 'source', 'acquired from', 'vendor', 'store'],
  purchasePrice: ['price', 'purchase price', 'cost', 'amount'],
  currency: ['currency', 'currency code'],
  tags: ['tags', 'tag', 'labels'],
  notes: ['notes', 'note', 'comments', 'comment'],
};

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function suggestMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const aliases = FIELD_ALIASES[field];
    const index = normalized.findIndex((header) => aliases.includes(header));
    mapping[field] = index >= 0 ? headers[index] ?? null : null;
  }
  return mapping;
}

function cleanValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const rich = value as { text?: string; result?: unknown };
    if (typeof rich.text === 'string') return rich.text.trim();
    if (rich.result !== undefined) return cleanValue(rich.result);
    return '';
  }
  return String(value).trim();
}

function normalizeRows(rows: unknown[][]): string[][] {
  const maximumColumns = Math.min(
    100,
    rows.reduce((max, row) => Math.max(max, row.length), 0),
  );
  return rows
    .map((row) => {
      const values: string[] = [];
      for (let index = 0; index < maximumColumns; index += 1) {
        values.push(cleanValue(row[index]));
      }
      return values;
    })
    .filter((row) => row.some((value) => value !== ''));
}

async function parseCsv(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  let rows: string[][];
  try {
    rows = parse(buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      columns: false,
    }) as string[][];
  } catch (error) {
    throw new HttpError(
      400,
      'INVALID_CSV',
      `The CSV file could not be read: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  if (rows.length === 0) {
    throw new HttpError(400, 'EMPTY_IMPORT', 'The CSV file does not contain any rows.');
  }
  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((value, index) => cleanValue(value) || `Column ${index + 1}`);
  return { headers, rows: normalizeRows(rows.slice(1)) };
}

async function parseXlsx(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (error) {
    throw new HttpError(
      400,
      'INVALID_XLSX',
      `The spreadsheet could not be read: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new HttpError(400, 'EMPTY_IMPORT', 'The spreadsheet does not contain a worksheet.');
  }

  const allRows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      values[columnNumber - 1] = cell.value;
    });
    allRows.push(values);
  });
  if (allRows.length === 0) {
    throw new HttpError(400, 'EMPTY_IMPORT', 'The spreadsheet does not contain any rows.');
  }
  const headerRow = allRows[0] ?? [];
  const headers = headerRow.map((value, index) => cleanValue(value) || `Column ${index + 1}`);
  return { headers, rows: normalizeRows(allRows.slice(1)) };
}

interface ImportJobRow extends RowDataPacket {
  id: string;
  original_name: string;
  file_type: string;
  headers: unknown;
  rows_json: string;
  row_count: number;
  created_at: string;
}

function parseHeaders(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getJob(id: string): Promise<ImportJobRow & { headers: string[] }> {
  const row = await queryOne<ImportJobRow>(pool, 'SELECT * FROM import_jobs WHERE id = ?', [id]);
  if (!row) notFound('That import preview has expired. Upload the file again.');
  return { ...row, headers: parseHeaders(row.headers) };
}

export interface ImportPreview {
  importId: string;
  originalName: string;
  fileType: string;
  headers: string[];
  rowCount: number;
  preview: Array<Record<string, string>>;
  suggestedMapping: ColumnMapping;
  availableFields: readonly ImportField[];
}

export async function createImportPreview(
  file: Express.Multer.File,
): Promise<ImportPreview> {
  const extension = path.extname(file.originalname).toLowerCase();
  let parsed: { headers: string[]; rows: string[][] };
  let fileType: string;

  if (extension === '.xlsx' || file.mimetype.includes('spreadsheetml')) {
    parsed = await parseXlsx(file.buffer);
    fileType = 'xlsx';
  } else {
    parsed = await parseCsv(file.buffer);
    fileType = 'csv';
  }

  if (parsed.headers.length === 0 || parsed.headers.length > 100) {
    throw new HttpError(400, 'INVALID_IMPORT', 'The file must have between 1 and 100 columns.');
  }
  if (parsed.rows.length === 0) {
    throw new HttpError(400, 'EMPTY_IMPORT', 'The file does not contain any data rows.');
  }
  if (parsed.rows.length > 3000) {
    throw new HttpError(413, 'IMPORT_TOO_LARGE', 'Import at most 3,000 rows at a time.');
  }

  const id = newId();
  await execute(
    pool,
    `INSERT INTO import_jobs (id, original_name, file_type, headers, rows_json, row_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      file.originalname.slice(0, 255),
      fileType,
      JSON.stringify(parsed.headers),
      JSON.stringify(parsed.rows),
      parsed.rows.length,
    ],
  );

  return {
    importId: id,
    originalName: file.originalname,
    fileType,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    preview: parsed.rows.slice(0, 10).map((row) =>
      Object.fromEntries(parsed.headers.map((header, index) => [header, row[index] ?? ''])),
    ),
    suggestedMapping: suggestMapping(parsed.headers),
    availableFields: IMPORT_FIELDS,
  };
}

export async function getImportPreview(id: string): Promise<ImportPreview> {
  const job = await getJob(id);
  const rows = JSON.parse(job.rows_json) as string[][];
  return {
    importId: job.id,
    originalName: job.original_name,
    fileType: job.file_type,
    headers: job.headers,
    rowCount: Number(job.row_count),
    preview: rows.slice(0, 10).map((row) =>
      Object.fromEntries(job.headers.map((header, index) => [header, row[index] ?? ''])),
    ),
    suggestedMapping: suggestMapping(job.headers),
    availableFields: IMPORT_FIELDS,
  };
}

export interface ImportCommitOptions {
  mapping: ColumnMapping;
  duplicateStrategy: 'add_copy' | 'skip';
  createMissingCollections: boolean;
}

export interface ImportCommitResult {
  importId: string;
  processed: number;
  createdBooks: number;
  addedCopies: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
}

function splitAuthors(value: string): string[] {
  if (!value) return [];
  const parts = value.includes(';') || value.includes('|') || value.includes('\n')
    ? value.split(/[;|\n]/)
    : [value];
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
}

function splitTags(value: string): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[;,|\n]/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

function parseFormat(value: string): ItemFormat | null {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, '');
  if (!normalized) return null;
  if (['digital', 'ebook', 'e-book', 'kindle', 'pdf', 'epub', 'audiobook'].includes(normalized)) {
    return 'digital';
  }
  if (['physical', 'paperback', 'hardcover', 'hardback', 'print', 'book'].includes(normalized)) {
    return 'physical';
  }
  return null;
}

const STATUS_ALIASES: Record<string, ItemStatus> = {
  owned: 'owned',
  have: 'owned',
  reading: 'reading',
  currentlyreading: 'reading',
  loaned: 'loaned',
  lent: 'loaned',
  borrowed: 'loaned',
  lost: 'lost',
  sold: 'sold',
  donated: 'donated',
  wishlist: 'wishlist',
  wish: 'wishlist',
  wanted: 'wishlist',
};

const CONDITION_ALIASES: Record<string, PhysicalCondition> = {
  new: 'new',
  likenew: 'like_new',
  asnew: 'like_new',
  verygood: 'very_good',
  good: 'good',
  fair: 'fair',
  poor: 'poor',
};

function parseStatus(value: string, fallback: ItemStatus): ItemStatus {
  const key = value.toLowerCase().replace(/[\s_-]/g, '');
  return STATUS_ALIASES[key] ?? fallback;
}

function parseCondition(value: string, fallback: PhysicalCondition | null): PhysicalCondition | null {
  const key = value.toLowerCase().replace(/[\s_-]/g, '');
  if (!key) return fallback;
  return CONDITION_ALIASES[key] ?? fallback;
}

function parsePrice(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseCurrency(value: string, fallback: string): string | null {
  if (!value) return fallback || null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback || null;
}

function parseDate(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export async function commitImport(
  id: string,
  options: ImportCommitOptions,
): Promise<ImportCommitResult> {
  const job = await getJob(id);
  const rows = JSON.parse(job.rows_json) as string[][];
  const headerIndex = new Map(job.headers.map((header, index) => [header, index]));
  const activeMapping = Object.entries(options.mapping).filter(
    (entry): entry is [ImportField, string] =>
      IMPORT_FIELDS.includes(entry[0] as ImportField) &&
      typeof entry[1] === 'string' &&
      headerIndex.has(entry[1]),
  );

  const rowValue = (row: string[], field: ImportField): string => {
    const header = options.mapping[field];
    if (!header) return '';
    const index = headerIndex.get(header);
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  if (activeMapping.length === 0) {
    throw new HttpError(422, 'MAPPING_REQUIRED', 'Map at least one spreadsheet column to a field.');
  }
  if (!options.mapping.title) {
    throw new HttpError(422, 'TITLE_MAPPING_REQUIRED', 'Map a column to Title before importing.');
  }

  const settings = await getAllSettings();
  const defaultCurrency = settings.default_currency || null;
  const defaultFormat: ItemFormat =
    settings.default_format === 'digital' ? 'digital' : 'physical';
  const conditionValues = new Set(['new', 'like_new', 'very_good', 'good', 'fair', 'poor']);
  const defaultCondition = conditionValues.has(settings.default_condition ?? '')
    ? (settings.default_condition as PhysicalCondition)
    : null;

  const result: ImportCommitResult = {
    importId: id,
    processed: 0,
    createdBooks: 0,
    addedCopies: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    warnings: [],
  };

  const collectionCache = new Map<string, string>();

  async function resolveCollection(name: string): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    const cached = collectionCache.get(key);
    if (cached) return cached;
    const existing = await findCollectionByName(name);
    if (existing) {
      collectionCache.set(key, existing.id);
      return existing.id;
    }
    if (!options.createMissingCollections) return null;
    const collection = await insertCollection({
      id: newId(),
      name: name.slice(0, 160),
      description: 'Created during a CSV import.',
      color: '#2C5D48',
    });
    collectionCache.set(key, collection.id);
    result.warnings.push(`Created collection â€œ${collection.name}â€ during import.`);
    return collection.id;
  }

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    result.processed += 1;
    const title = rowValue(row, 'title');
    if (!title) {
      result.failed += 1;
      if (result.errors.length < 200) {
        result.errors.push({ row: rowNumber, message: 'Title is required.' });
      }
      continue;
    }

    try {
      let isbn10: string | null = null;
      let isbn13: string | null = null;
      const isbnSources = [
        rowValue(row, 'isbn'),
        rowValue(row, 'isbn10'),
        rowValue(row, 'isbn13'),
      ].filter(Boolean);

      for (const raw of isbnSources) {
        const normalized = normalizeIsbn(raw);
        if (!normalized.valid) {
          throw new Error(`â€œ${raw}â€ is not a valid ISBN.`);
        }
        if (normalized.isbn10 && isbn10 && normalized.isbn10 !== isbn10) {
          throw new Error('The ISBN columns refer to different editions.');
        }
        if (normalized.isbn13 && isbn13 && normalized.isbn13 !== isbn13) {
          throw new Error('The ISBN columns refer to different editions.');
        }
        isbn10 = isbn10 ?? normalized.isbn10;
        isbn13 = isbn13 ?? normalized.isbn13;
      }

      const existing =
        isbn10 || isbn13
          ? await queryOne<RowDataPacket & { id: string; title: string }>(
              pool,
              'SELECT id, title FROM books WHERE isbn13 = ? OR isbn10 = ? LIMIT 1',
              [isbn13, isbn10],
            )
          : null;

      if (existing) {
        if (options.duplicateStrategy === 'skip') {
          result.skipped += 1;
          continue;
        }
        const format = parseFormat(rowValue(row, 'format')) ?? defaultFormat;
        const condition = format === 'digital'
          ? null
          : parseCondition(rowValue(row, 'condition'), defaultCondition);
        const collectionId = await resolveCollection(rowValue(row, 'collection'));
        const acquisitionDate = parseDate(rowValue(row, 'acquisitionDate'));
        if (rowValue(row, 'acquisitionDate') && !acquisitionDate) {
          result.warnings.push(`Row ${rowNumber}: ignored an unreadable acquisition date.`);
        }
        await withTransaction(async (connection) => {
          await insertItem(connection, {
            bookId: existing.id,
            accessionNumber: rowValue(row, 'accessionNumber') || null,
            acquisitionDate,
            acquisitionSource: rowValue(row, 'acquisitionSource') || null,
            purchasePrice: parsePrice(rowValue(row, 'purchasePrice')),
            currency: parseCurrency(rowValue(row, 'currency'), defaultCurrency ?? ''),
            shelfLocation: rowValue(row, 'shelfLocation') || null,
            collectionId,
            physicalCondition: condition,
            format,
            itemStatus: parseStatus(rowValue(row, 'status'), 'owned'),
            notes: rowValue(row, 'notes') || null,
            tags: splitTags(rowValue(row, 'tags')),
          });
          await logAudit(connection, {
            action: 'import.item_added',
            entityType: 'book',
            entityId: existing.id,
            summary: `Added a copy of â€œ${existing.title}â€ from an import`,
          });
        });
        result.addedCopies += 1;
        continue;
      }

      const publicationDate = rowValue(row, 'publicationDate') || null;
      const explicitYear = Number.parseInt(rowValue(row, 'publicationYear'), 10);
      const publicationYear =
        Number.isFinite(explicitYear) && explicitYear >= 1000 && explicitYear <= 2200
          ? explicitYear
          : parseYear(publicationDate);
      const pageCountValue = Number.parseInt(rowValue(row, 'pageCount'), 10);
      const format = parseFormat(rowValue(row, 'format')) ?? defaultFormat;
      const condition = format === 'digital'
        ? null
        : parseCondition(rowValue(row, 'condition'), defaultCondition);
      const collectionId = await resolveCollection(rowValue(row, 'collection'));
      const bookId = newId();
      const acquisitionDate = parseDate(rowValue(row, 'acquisitionDate'));

      const book: BookWrite = {
        id: bookId,
        title,
        subtitle: rowValue(row, 'subtitle') || null,
        authors: splitAuthors(rowValue(row, 'authors')),
        isbn10,
        isbn13,
        publisher: rowValue(row, 'publisher') || null,
        publicationDate,
        publicationYear,
        edition: rowValue(row, 'edition') || null,
        language: rowValue(row, 'language') || null,
        pageCount:
          Number.isFinite(pageCountValue) && pageCountValue >= 0 ? pageCountValue : null,
        description: rowValue(row, 'description') || null,
        tableOfContents: null,
        seriesTitle: rowValue(row, 'seriesTitle') || null,
        seriesVolume: rowValue(row, 'seriesVolume') || null,
        subjects: splitTags(rowValue(row, 'subjects')),
        coverImageUrl: null,
        coverImageSource: null,
        metadataSource: 'import',
        externalReference: null,
        externalUrl: null,
        originalPublicationDate: null,
        fieldSources: null,
        metadataRetrievedAt: null,
      };

      await withTransaction(async (connection) => {
        await insertBook(connection, book);
        await insertItem(connection, {
          bookId,
          accessionNumber: rowValue(row, 'accessionNumber') || null,
          acquisitionDate,
          acquisitionSource: rowValue(row, 'acquisitionSource') || null,
          purchasePrice: parsePrice(rowValue(row, 'purchasePrice')),
          currency: parseCurrency(rowValue(row, 'currency'), defaultCurrency ?? ''),
          shelfLocation: rowValue(row, 'shelfLocation') || null,
          collectionId,
          physicalCondition: condition,
          format,
          itemStatus: parseStatus(rowValue(row, 'status'), 'owned'),
          notes: rowValue(row, 'notes') || null,
          tags: splitTags(rowValue(row, 'tags')),
        });
        await logAudit(connection, {
          action: 'import.book_created',
          entityType: 'book',
          entityId: bookId,
          summary: `Imported â€œ${title}â€`,
        });
      });
      result.createdBooks += 1;
    } catch (error) {
      result.failed += 1;
      if (result.errors.length < 200) {
        result.errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Unknown import error.',
        });
      }
    }
  }

  await execute(pool, 'DELETE FROM import_jobs WHERE id = ?', [id]);
  return result;
}
