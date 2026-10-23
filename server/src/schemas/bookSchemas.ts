import { z } from 'zod';
import {
  emptyToNull,
  idSchema,
  optionalDate,
  optionalInt,
  optionalMoney,
  optionalString,
} from './common.js';

const stringArray = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .optional()
    .default([]);

export const bookMetadataSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(500),
  subtitle: optionalString(500),
  authors: stringArray(25, 255),
  isbn10: optionalString(20),
  isbn13: optionalString(20),
  publisher: optionalString(255),
  publicationDate: optionalString(64),
  publicationYear: optionalInt(1000, 2200),
  edition: optionalString(128),
  language: optionalString(64),
  pageCount: optionalInt(0, 100_000),
  description: optionalString(20_000),
  tableOfContents: optionalString(20_000),
  seriesTitle: optionalString(255),
  seriesVolume: optionalString(64),
  originalPublicationDate: optionalString(64),
  subjects: stringArray(40, 160),
  coverImageUrl: optionalString(1024),
  coverImageSource: optionalString(64),
  metadataSource: optionalString(64),
  externalReference: optionalString(255),
  externalUrl: optionalString(1024),
  metadataRetrievedAt: optionalString(40),
  fieldSources: z.record(z.string().max(60), z.string().max(60)).optional(),
});

export const itemFieldsSchema = z.object({
  accessionNumber: optionalString(128),
  acquisitionDate: optionalDate,
  acquisitionSource: optionalString(255),
  purchasePrice: optionalMoney,
  currency: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code.'))
      .nullable()
      .optional(),
  ),
  shelfLocation: optionalString(128),
  collectionId: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, 'Invalid collection.')
      .nullable()
      .optional(),
  ),
  physicalCondition: z.preprocess(
    emptyToNull,
    z.enum(['new', 'like_new', 'very_good', 'good', 'fair', 'poor']).nullable().optional(),
  ),
  format: z.enum(['physical', 'digital']).optional(),
  itemStatus: z
    .enum(['owned', 'reading', 'loaned', 'lost', 'sold', 'donated', 'wishlist'])
    .optional(),
  notes: optionalString(5000),
  tags: stringArray(30, 80),
});

export const createBookSchema = z.object({
  book: bookMetadataSchema,
  item: itemFieldsSchema.optional().default({}),
  duplicateAcknowledged: z.boolean().optional().default(false),
});

export const updateBookSchema = bookMetadataSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update.',
);

export const createItemForBookSchema = itemFieldsSchema;

export const updateItemSchema = itemFieldsSchema.refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update.',
);

export const catalogItemCreateSchema = itemFieldsSchema.extend({
  bookId: idSchema,
});

export const duplicateQuerySchema = z.object({
  isbn: z.string().trim().max(20).optional(),
  title: z.string().trim().max(500).optional(),
  author: z.string().trim().max(255).optional(),
  excludeBookId: idSchema.optional(),
});

export const isbnLookupSchema = z.object({
  isbn: z.string().trim().min(10).max(20),
  title: optionalString(500),
  author: optionalString(255),
});

export const metadataSearchSchema = z
  .object({
    q: optionalString(300),
    title: optionalString(500),
    author: optionalString(255),
  })
  .refine(
    (value) => Boolean(value.q || value.title),
    'Enter a search phrase or a title.',
  );

export const catalogQuerySchema = z.object({
  q: optionalString(200),
  collectionId: z.preprocess(
    emptyToNull,
    z.string().max(40).nullable().optional(),
  ),
  format: z.preprocess(emptyToNull, z.enum(['physical', 'digital']).nullable().optional()),
  condition: z.preprocess(
    emptyToNull,
    z.enum(['new', 'like_new', 'very_good', 'good', 'fair', 'poor']).nullable().optional(),
  ),
  status: z.preprocess(
    emptyToNull,
    z.enum(['owned', 'reading', 'loaned', 'lost', 'sold', 'donated', 'wishlist']).nullable().optional(),
  ),
  language: optionalString(64),
  publisher: optionalString(255),
  yearFrom: optionalInt(1000, 2200),
  yearTo: optionalInt(1000, 2200),
  missingCover: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (value === 'true' || value === true || value === '1') return true;
      if (value === 'false' || value === false || value === '0') return false;
      return value;
    },
    z.boolean().optional(),
  ),
  missingMetadata: z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      if (value === 'true' || value === true || value === '1') return true;
      if (value === 'false' || value === false || value === '0') return false;
      return value;
    },
    z.boolean().optional(),
  ),
  addedFrom: optionalString(20),
  addedTo: optionalString(20),
  sort: z
    .enum(['title', 'author', 'publicationDate', 'dateAdded', 'publisher', 'itemId', 'accessionNumber'])
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const collectionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(160),
  description: optionalString(500),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex colour.')
    .optional()
    .default('#2C5D48'),
});

export const updateCollectionSchema = collectionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one field to update.',
);

export const settingsSchema = z.object({
  library_name: z.string().trim().min(1).max(160).optional(),
  default_currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/))
    .optional(),
  default_format: z.enum(['physical', 'digital']).optional(),
  default_condition: z.enum(['new', 'like_new', 'very_good', 'good', 'fair', 'poor']).optional(),
});
