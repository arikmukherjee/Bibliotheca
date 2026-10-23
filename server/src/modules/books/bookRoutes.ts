import { Router } from 'express';
import {
  createBookSchema,
  createItemForBookSchema,
  duplicateQuerySchema,
  metadataSearchSchema,
  updateBookSchema,
} from '../../schemas/bookSchemas.js';
import {
  parseWith,
} from '../../schemas/common.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { imageUpload, requireUploadedFile } from '../../middleware/upload.js';
import { saveCoverImage, validateImage } from '../../utils/files.js';
import {
  attachExistingBooks,
  createBook,
  createItemForBook,
  deleteBookRecord,
  getBookDetail,
  getDuplicateCandidates,
  setBookCover,
  updateBookRecord,
} from './bookService.js';
import { searchBooks } from '../../services/metadata/index.js';
import { getItemsForBook } from '../catalog/itemRepository.js';

export const bookRoutes = Router();

bookRoutes.get(
  '/search',
  asyncHandler(async (req, res) => {
    const query = parseWith(metadataSearchSchema, req.query);
    const result = await searchBooks({
      title: query.title,
      author: query.author,
      query: query.q,
    });
    const candidates = await attachExistingBooks(result.candidates);
    res.json({ data: candidates, warnings: result.warnings });
  }),
);

bookRoutes.get(
  '/duplicates',
  asyncHandler(async (req, res) => {
    const query = parseWith(duplicateQuerySchema, req.query);
    const duplicates = await getDuplicateCandidates(query);
    res.json({ data: duplicates });
  }),
);

bookRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const book = await getBookDetail(req.params.id!);
    res.json({ data: book });
  }),
);

bookRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseWith(createBookSchema, req.body);
    const result = await createBook(input);
    res.status(201).json({
      data: { book: result.book, item: result.item },
      warnings: result.warnings,
    });
  }),
);

bookRoutes.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = parseWith(updateBookSchema, req.body);
    const book = await updateBookRecord(req.params.id!, input);
    res.json({ data: book });
  }),
);

bookRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await deleteBookRecord(req.params.id!);
    res.json({ data: result });
  }),
);

bookRoutes.get(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const items = await getItemsForBook(req.params.id!);
    res.json({ data: items });
  }),
);

bookRoutes.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const input = parseWith(createItemForBookSchema, req.body);
    const item = await createItemForBook(req.params.id!, input);
    res.status(201).json({ data: item });
  }),
);

bookRoutes.post(
  '/:id/cover',
  imageUpload.single('image'),
  asyncHandler(async (req, res) => {
    const file = requireUploadedFile(req.file, 'Choose a cover image to upload.');
    await validateImage(file);
    const url = await saveCoverImage(file.buffer);
    const book = await setBookCover(req.params.id!, url, 'upload');
    res.json({ data: book });
  }),
);
