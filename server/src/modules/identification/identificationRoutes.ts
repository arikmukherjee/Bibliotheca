import { Router } from 'express';
import { isbnLookupSchema } from '../../schemas/bookSchemas.js';
import { parseWith } from '../../schemas/common.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { imageUpload, requireUploadedFile } from '../../middleware/upload.js';
import { identifyLimiter } from '../../middleware/rateLimit.js';
import { validateImage } from '../../utils/files.js';
import { identifyBookFromImage } from '../../services/identification/index.js';
import { lookupByIsbn } from '../../services/metadata/index.js';
import { attachExistingBooks } from '../books/bookService.js';
import { findBookByIsbn } from '../books/bookRepository.js';
import { countItemsForBook } from '../books/bookRepository.js';
import { toBookSummary } from '../books/bookRepository.js';
import { normalizeIsbn } from '../../utils/isbn.js';

export const identificationRoutes = Router();

identificationRoutes.post(
  '/image',
  identifyLimiter,
  imageUpload.single('image'),
  asyncHandler(async (req, res) => {
    const file = requireUploadedFile(req.file, 'Choose a photo of the book to identify.');
    await validateImage(file);
    const result = await identifyBookFromImage({
      buffer: file.buffer,
      originalName: file.originalname,
    });
    const candidates = await attachExistingBooks(result.candidates);
    res.json({
      data: { ...result, candidates },
      warnings: result.warnings,
      notes: result.notes,
    });
  }),
);

identificationRoutes.post(
  '/isbn',
  identifyLimiter,
  asyncHandler(async (req, res) => {
    const body = parseWith(isbnLookupSchema, req.body);
    const result = await lookupByIsbn(body.isbn, {
      title: body.title,
      author: body.author,
    });
    const candidates = await attachExistingBooks(result.candidates);

    const normalized = normalizeIsbn(body.isbn);
    const existing = normalized.valid
      ? await findBookByIsbn(normalized.isbn10, normalized.isbn13)
      : null;
    const existingBook = existing
      ? { ...toBookSummary(existing), itemCount: await countItemsForBook(existing.id) }
      : null;

    res.json({
      data: { candidates, warnings: result.warnings, existingBook },
      warnings: result.warnings,
    });
  }),
);
