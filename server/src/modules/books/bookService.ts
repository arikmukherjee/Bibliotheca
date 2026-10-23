import type { z } from 'zod';
import { pool, withTransaction } from '../../db/pool.js';
import type {
  bookMetadataSchema,
  createBookSchema,
  itemFieldsSchema,
  updateBookSchema,
} from '../../schemas/bookSchemas.js';
import type {
  Book,
  BookDetail,
  CatalogEntry,
  CatalogItem,
  DuplicateCandidate,
  ItemFormat,
  ItemStatus,
  PhysicalCondition,
} from '../../types/models.js';
import { logAudit } from '../../utils/audit.js';
import { isLocalCoverUrl, normalizeRemoteCoverUrl, removeLocalCover } from '../../utils/covers.js';
import { toMysqlDateTime } from '../../utils/dates.js';
import { conflict, HttpError, notFound } from '../../utils/errors.js';
import { isbnReasonMessage, normalizeIsbn } from '../../utils/isbn.js';
import { newId } from '../../utils/ids.js';
import { parseYear } from '../../utils/text.js';
import {
  countItemsForBook,
  deleteBookRecord as deleteBookRow,
  findBookByIsbn,
  findBooksByIsbns,
  findDuplicates,
  getBook,
  insertBook,
  toBookSummary,
  updateBook,
  type BookWrite,
} from './bookRepository.js';
import {
  getItem,
  getItemsForBook,
  deleteItemRecord,
  insertItem,
  updateItemRecord,
} from '../catalog/itemRepository.js';
import { getCollection } from '../collections/collectionRepository.js';
import { getAllSettings } from '../settings/settingsRepository.js';
import type { CandidateMatch } from '../../services/metadata/types.js';

type BookMetadataInput = z.infer<typeof bookMetadataSchema>;
type BookUpdateInput = z.infer<typeof updateBookSchema>;
type BookCreateInput = z.infer<typeof createBookSchema>;
type ItemFieldsInput = z.infer<typeof itemFieldsSchema>;

interface ItemDefaults {
  currency: string | null;
  format: ItemFormat;
  condition: PhysicalCondition | null;
}

interface ResolvedItem {
  accessionNumber: string | null;
  acquisitionDate: string | null;
  acquisitionSource: string | null;
  purchasePrice: number | null;
  currency: string | null;
  shelfLocation: string | null;
  collectionId: string | null;
  physicalCondition: PhysicalCondition | null;
  format: ItemFormat;
  itemStatus: ItemStatus;
  notes: string | null;
  tags: string[];
}

function uniqueStrings(values: string[], max: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

function resolveIsbnPair(
  input10: string | null | undefined,
  input13: string | null | undefined,
  existing: Book | null,
): { isbn10: string | null; isbn13: string | null } {
  const tenProvided = input10 !== undefined;
  const thirteenProvided = input13 !== undefined;

  if (!tenProvided && !thirteenProvided) {
    return { isbn10: existing?.isbn10 ?? null, isbn13: existing?.isbn13 ?? null };
  }

  const raws = [tenProvided ? input10 : null, thirteenProvided ? input13 : null].filter(
    (value): value is string => Boolean(value),
  );

  if (raws.length === 0) {
    return { isbn10: null, isbn13: null };
  }

  const normalized = raws.map((raw) => ({ raw, value: normalizeIsbn(raw) }));
  const invalid = normalized.find((entry) => !entry.value.valid);
  if (invalid) {
    throw new HttpError(422, 'INVALID_ISBN', isbnReasonMessage(invalid.value.reason), {
      isbn: invalid.raw,
      reason: invalid.value.reason,
    });
  }

  const isbn13Values = [
    ...new Set(normalized.map((entry) => entry.value.isbn13).filter((value): value is string => Boolean(value))),
  ];
  const isbn10Values = [
    ...new Set(normalized.map((entry) => entry.value.isbn10).filter((value): value is string => Boolean(value))),
  ];

  if (isbn13Values.length > 1 || isbn10Values.length > 1) {
    throw new HttpError(
      422,
      'ISBN_MISMATCH',
      'The ISBN-10 and ISBN-13 refer to different editions. Keep only one.',
    );
  }

  const isbn13 = isbn13Values[0] ?? null;
  const isbn10 = isbn10Values[0] ?? null;

  if (isbn13 && isbn10) {
    const from10 = normalizeIsbn(isbn10);
    if (from10.isbn13 && from10.isbn13 !== isbn13) {
      throw new HttpError(
        422,
        'ISBN_MISMATCH',
        'The ISBN-10 and ISBN-13 refer to different editions. Keep only one.',
      );
    }
  }

  return { isbn10, isbn13 };
}

function sanitizeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function resolveCover(
  input: BookMetadataInput | BookUpdateInput,
  existing: Book | null,
): { url: string | null; source: string | null } {
  if (input.coverImageUrl !== undefined) {
    if (!input.coverImageUrl) return { url: null, source: null };
    if (isLocalCoverUrl(input.coverImageUrl)) {
      return { url: input.coverImageUrl, source: 'upload' };
    }
    const remote = normalizeRemoteCoverUrl(input.coverImageUrl);
    if (!remote) {
      throw new HttpError(
        400,
        'INVALID_COVER_URL',
        'Cover images must be uploaded or come from a supported metadata provider.',
      );
    }
    return {
      url: remote,
      source: input.coverImageSource?.trim() || existing?.coverImageSource || 'external',
    };
  }

  if (input.coverImageSource !== undefined && existing?.coverImageUrl) {
    return {
      url: existing.coverImageUrl,
      source: input.coverImageSource ?? existing.coverImageSource,
    };
  }

  return {
    url: existing?.coverImageUrl ?? null,
    source: existing?.coverImageSource ?? null,
  };
}

function buildBookWrite(
  id: string,
  input: BookMetadataInput | BookUpdateInput,
  existing: Book | null,
): BookWrite {
  const { isbn10, isbn13 } = resolveIsbnPair(input.isbn10, input.isbn13, existing);
  const cover = resolveCover(input, existing);

  const publicationDate =
    input.publicationDate !== undefined
      ? input.publicationDate
      : existing?.publicationDate ?? null;

  let publicationYear: number | null;
  if (input.publicationYear !== undefined) {
    publicationYear = input.publicationYear;
  } else if (input.publicationDate !== undefined) {
    publicationYear = parseYear(publicationDate);
  } else {
    publicationYear = existing?.publicationYear ?? parseYear(publicationDate);
  }

  return {
    id,
    title: (input.title ?? existing?.title ?? '').trim(),
    subtitle: input.subtitle !== undefined ? input.subtitle : existing?.subtitle ?? null,
    authors:
      input.authors !== undefined
        ? uniqueStrings(input.authors, 25)
        : existing?.authors ?? [],
    isbn10,
    isbn13,
    publisher: input.publisher !== undefined ? input.publisher : existing?.publisher ?? null,
    publicationDate,
    publicationYear,
    edition: input.edition !== undefined ? input.edition : existing?.edition ?? null,
    language: input.language !== undefined ? input.language : existing?.language ?? null,
    pageCount: input.pageCount !== undefined ? input.pageCount : existing?.pageCount ?? null,
    description:
      input.description !== undefined ? input.description : existing?.description ?? null,
    tableOfContents:
      input.tableOfContents !== undefined
        ? input.tableOfContents
        : existing?.tableOfContents ?? null,
    seriesTitle:
      input.seriesTitle !== undefined ? input.seriesTitle : existing?.seriesTitle ?? null,
    seriesVolume:
      input.seriesVolume !== undefined ? input.seriesVolume : existing?.seriesVolume ?? null,
    subjects:
      input.subjects !== undefined
        ? uniqueStrings(input.subjects, 40)
        : existing?.subjects ?? [],
    coverImageUrl: cover.url,
    coverImageSource: cover.source,
    metadataSource:
      input.metadataSource !== undefined
        ? input.metadataSource
        : existing?.metadataSource ?? null,
    externalReference:
      input.externalReference !== undefined
        ? input.externalReference
        : existing?.externalReference ?? null,
    externalUrl:
      input.externalUrl !== undefined
        ? sanitizeExternalUrl(input.externalUrl)
        : existing?.externalUrl ?? null,
    originalPublicationDate:
      input.originalPublicationDate !== undefined
        ? input.originalPublicationDate
        : existing?.originalPublicationDate ?? null,
    fieldSources:
      input.fieldSources !== undefined ? input.fieldSources : existing?.fieldSources ?? null,
    metadataRetrievedAt:
      input.metadataRetrievedAt !== undefined
        ? toMysqlDateTime(input.metadataRetrievedAt)
        : existing?.metadataRetrievedAt ?? null,
  };
}

async function getItemDefaults(): Promise<ItemDefaults> {
  const settings = await getAllSettings();
  const format: ItemFormat = settings.default_format === 'digital' ? 'digital' : 'physical';
  const conditionValues = new Set(['new', 'like_new', 'very_good', 'good', 'fair', 'poor']);
  const condition = conditionValues.has(settings.default_condition ?? '')
    ? (settings.default_condition as PhysicalCondition)
    : null;
  return {
    currency: settings.default_currency || null,
    format,
    condition: format === 'physical' ? condition : null,
  };
}

async function assertCollection(collectionId: string | null): Promise<void> {
  if (!collectionId) return;
  const collection = await getCollection(collectionId);
  if (!collection) {
    throw new HttpError(422, 'INVALID_COLLECTION', 'The selected collection no longer exists.');
  }
}

function resolveItem(
  input: ItemFieldsInput,
  existing: CatalogItem | null,
  defaults: ItemDefaults,
): ResolvedItem {
  const format = input.format ?? existing?.format ?? defaults.format;
  const condition =
    input.physicalCondition !== undefined
      ? input.physicalCondition
      : existing
        ? (existing.physicalCondition as PhysicalCondition | null)
        : defaults.condition;

  return {
    accessionNumber:
      input.accessionNumber !== undefined
        ? input.accessionNumber
        : existing?.accessionNumber ?? null,
    acquisitionDate:
      input.acquisitionDate !== undefined
        ? input.acquisitionDate
        : existing?.acquisitionDate ?? null,
    acquisitionSource:
      input.acquisitionSource !== undefined
        ? input.acquisitionSource
        : existing?.acquisitionSource ?? null,
    purchasePrice:
      input.purchasePrice !== undefined ? input.purchasePrice : existing?.purchasePrice ?? null,
    currency: input.currency !== undefined ? input.currency : existing ? existing.currency : defaults.currency,
    shelfLocation:
      input.shelfLocation !== undefined ? input.shelfLocation : existing?.shelfLocation ?? null,
    collectionId:
      input.collectionId !== undefined ? input.collectionId : existing?.collectionId ?? null,
    physicalCondition: format === 'digital' ? null : condition,
    format,
    itemStatus:
      (input.itemStatus as ItemStatus | undefined) ??
      ((existing?.itemStatus as ItemStatus | undefined) || 'owned'),
    notes: input.notes !== undefined ? input.notes : existing?.notes ?? null,
    tags: input.tags !== undefined ? uniqueStrings(input.tags, 30) : existing?.tags ?? [],
  };
}

export async function getBookDetail(id: string): Promise<BookDetail> {
  const book = await getBook(id);
  if (!book) notFound('Bibliographic record not found.');
  const items = await getItemsForBook(id);
  return { ...book, items, itemCount: items.length };
}

export async function createBook(input: BookCreateInput): Promise<{
  book: Book;
  item: CatalogEntry;
  warnings: string[];
}> {
  const id = newId();
  const bookWrite = buildBookWrite(id, input.book, null);
  const warnings: string[] = [];

  if (bookWrite.isbn10 || bookWrite.isbn13) {
    const existing = await findBookByIsbn(bookWrite.isbn10, bookWrite.isbn13);
    if (existing) {
      const itemCount = await countItemsForBook(existing.id);
      throw conflict(
        `This ISBN already belongs to “${existing.title}” in your library. Add another copy to that record instead of creating a duplicate edition.`,
        {
          duplicates: [
            {
              book: toBookSummary(existing),
              itemCount,
              matchReason: 'isbn',
              similarity: 1,
            },
          ],
          existingBook: { ...toBookSummary(existing), itemCount },
        },
      );
    }
  } else {
    const duplicates = await findDuplicates({
      isbn10: null,
      isbn13: null,
      title: bookWrite.title,
      author: bookWrite.authors[0] ?? null,
    });
    if (duplicates.length > 0 && !input.duplicateAcknowledged) {
      throw conflict(
        'Possible duplicate records were found. Review them, or confirm that this is a different edition.',
        { duplicates },
      );
    }
    if (duplicates.length > 0) {
      warnings.push(
        `Saved as a separate record even though ${duplicates.length} similar record(s) exist.`,
      );
    }
  }

  const defaults = await getItemDefaults();
  const itemData = resolveItem(input.item, null, defaults);
  await assertCollection(itemData.collectionId);

  const result = await withTransaction(async (connection) => {
    await insertBook(connection, bookWrite);
    const createdItem = await insertItem(connection, {
      bookId: id,
      ...itemData,
    });
    await logAudit(connection, {
      action: 'book.created',
      entityType: 'book',
      entityId: id,
      summary: `Added “${bookWrite.title}” (${createdItem.itemCode})`,
      details: { itemId: createdItem.id, isbn13: bookWrite.isbn13 },
    });
    return createdItem;
  });

  const book = await getBook(id);
  const item = await getItem(result.id);
  if (!book || !item) throw new Error('Book was saved but could not be read back.');
  return { book, item, warnings };
}

export async function updateBookRecord(id: string, input: BookUpdateInput): Promise<Book> {
  const existing = await getBook(id);
  if (!existing) notFound('Bibliographic record not found.');

  const bookWrite = buildBookWrite(id, input, existing);

  if (bookWrite.isbn10 || bookWrite.isbn13) {
    const duplicate = await findBookByIsbn(bookWrite.isbn10, bookWrite.isbn13, id);
    if (duplicate) {
      throw conflict(
        `That ISBN already belongs to “${duplicate.title}”. Each ISBN should identify one edition record.`,
        { existingBook: toBookSummary(duplicate) },
      );
    }
  }

  await withTransaction(async (connection) => {
    await updateBook(connection, bookWrite);
    await logAudit(connection, {
      action: 'book.updated',
      entityType: 'book',
      entityId: id,
      summary: `Updated metadata for “${bookWrite.title}”`,
    });
  });

  if (
    existing.coverImageUrl &&
    isLocalCoverUrl(existing.coverImageUrl) &&
    existing.coverImageUrl !== bookWrite.coverImageUrl
  ) {
    await removeLocalCover(existing.coverImageUrl);
  }

  const updated = await getBook(id);
  if (!updated) throw new Error('Book was updated but could not be read back.');
  return updated;
}

export async function setBookCover(
  id: string,
  coverImageUrl: string | null,
  coverImageSource: string | null,
): Promise<Book> {
  return updateBookRecord(id, {
    coverImageUrl,
    coverImageSource,
  });
}

export async function deleteBookRecord(id: string): Promise<{ book: Book; itemCount: number }> {
  const book = await getBook(id);
  if (!book) notFound('Bibliographic record not found.');
  const itemCount = await countItemsForBook(id);
  if (itemCount > 0) {
    throw conflict(
      `This record still has ${itemCount} catalog item${itemCount === 1 ? '' : 's'}. Delete or move those copies before deleting the edition record.`,
      { itemCount },
    );
  }

  await withTransaction(async (connection) => {
    await deleteBookRow(connection, id);
    await logAudit(connection, {
      action: 'book.deleted',
      entityType: 'book',
      entityId: id,
      summary: `Deleted bibliographic record “${book.title}”`,
    });
  });

  if (book.coverImageUrl && isLocalCoverUrl(book.coverImageUrl)) {
    await removeLocalCover(book.coverImageUrl);
  }

  return { book, itemCount };
}

export async function createItemForBook(
  bookId: string,
  input: ItemFieldsInput,
): Promise<CatalogEntry> {
  const book = await getBook(bookId);
  if (!book) notFound('Bibliographic record not found.');
  const defaults = await getItemDefaults();
  const itemData = resolveItem(input, null, defaults);
  await assertCollection(itemData.collectionId);

  const created = await withTransaction(async (connection) => {
    const item = await insertItem(connection, { bookId, ...itemData });
    await logAudit(connection, {
      action: 'item.created',
      entityType: 'catalog_item',
      entityId: item.id,
      summary: `Added a copy of “${book.title}” (${item.itemCode})`,
      details: { bookId },
    });
    return item;
  });

  const item = await getItem(created.id);
  if (!item) throw new Error('Catalog item was saved but could not be read back.');
  return item;
}

export async function duplicateCatalogItem(sourceId: string): Promise<CatalogEntry> {
  const source = await getItem(sourceId);
  if (!source) notFound('Catalog item not found.');

  const created = await withTransaction(async (connection) => {
    const item = await insertItem(connection, {
      bookId: source.bookId,
      accessionNumber: null,
      acquisitionDate: null,
      acquisitionSource: null,
      purchasePrice: null,
      currency: source.currency,
      shelfLocation: source.shelfLocation,
      collectionId: source.collectionId,
      physicalCondition: source.physicalCondition as PhysicalCondition | null,
      format: source.format,
      itemStatus: 'owned',
      notes: null,
      tags: source.tags,
    });
    await logAudit(connection, {
      action: 'item.copied',
      entityType: 'catalog_item',
      entityId: item.id,
      summary: `Added another copy of “${source.book.title}” (${item.itemCode})`,
      details: { sourceItemId: source.id, bookId: source.bookId },
    });
    return item;
  });

  const item = await getItem(created.id);
  if (!item) throw new Error('Copy was saved but could not be read back.');
  return item;
}

export async function updateCatalogItem(
  id: string,
  input: ItemFieldsInput,
): Promise<CatalogEntry> {
  const existing = await getItem(id);
  if (!existing) notFound('Catalog item not found.');
  const defaults = await getItemDefaults();
  const itemData = resolveItem(input, existing, defaults);
  await assertCollection(itemData.collectionId);

  await withTransaction(async (connection) => {
    await updateItemRecord(connection, {
      id,
      itemCode: existing.itemCode,
      bookId: existing.bookId,
      ...itemData,
    });
    await logAudit(connection, {
      action: 'item.updated',
      entityType: 'catalog_item',
      entityId: id,
      summary: `Updated catalog item ${existing.itemCode} (“${existing.book.title}”)`,
    });
  });

  const item = await getItem(id);
  if (!item) throw new Error('Catalog item was updated but could not be read back.');
  return item;
}

export async function removeCatalogItem(id: string): Promise<CatalogEntry> {
  const item = await getItem(id);
  if (!item) notFound('Catalog item not found.');

  await withTransaction(async (connection) => {
    await deleteItemRecord(connection, id);
    await logAudit(connection, {
      action: 'item.deleted',
      entityType: 'catalog_item',
      entityId: id,
      summary: `Deleted catalog item ${item.itemCode} (“${item.book.title}”)`,
      details: { bookId: item.bookId },
    });
  });

  return item;
}

export async function getDuplicateCandidates(input: {
  isbn?: string | null;
  title?: string | null;
  author?: string | null;
  excludeBookId?: string;
}): Promise<DuplicateCandidate[]> {
  const normalized = input.isbn ? normalizeIsbn(input.isbn) : null;
  if (normalized?.valid) {
    return findDuplicates({
      isbn10: normalized.isbn10,
      isbn13: normalized.isbn13,
      excludeBookId: input.excludeBookId,
    });
  }
  if (!input.title) return [];
  return findDuplicates({
    isbn10: null,
    isbn13: null,
    title: input.title,
    author: input.author,
    excludeBookId: input.excludeBookId,
  });
}

export async function attachExistingBooks(
  candidates: CandidateMatch[],
): Promise<CandidateMatch[]> {
  const isbns = candidates.flatMap((candidate) =>
    [candidate.isbn13, candidate.isbn10].filter((value): value is string => Boolean(value)),
  );
  if (isbns.length === 0) return candidates;
  const matches = await findBooksByIsbns(isbns);

  return candidates.map((candidate) => {
    const match =
      (candidate.isbn13 ? matches.get(candidate.isbn13) : undefined) ??
      (candidate.isbn10 ? matches.get(candidate.isbn10) : undefined);
    if (!match) return { ...candidate, existingBook: null };
    return {
      ...candidate,
      existingBook: {
        id: match.book.id,
        title: match.book.title,
        authors: match.book.authors,
        coverImageUrl: match.book.coverImageUrl,
        itemCount: match.itemCount,
      },
    };
  });
}
