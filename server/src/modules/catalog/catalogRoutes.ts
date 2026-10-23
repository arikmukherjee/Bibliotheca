import { Router } from 'express';
import {
  catalogItemCreateSchema,
  catalogQuerySchema,
  updateItemSchema,
} from '../../schemas/bookSchemas.js';
import { parseWith } from '../../schemas/common.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getCollections } from '../collections/collectionService.js';
import {
  createItemForBook,
  duplicateCatalogItem,
  removeCatalogItem,
  updateCatalogItem,
} from '../books/bookService.js';
import { getFilterOptions, listCatalog } from './itemRepository.js';
import { toCatalogFilters } from './catalogFilters.js';

export const catalogRoutes = Router();

catalogRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parseWith(catalogQuerySchema, req.query);
    const list = await listCatalog(toCatalogFilters(query));
    res.json(list);
  }),
);

catalogRoutes.get(
  '/filters',
  asyncHandler(async (_req, res) => {
    const [filters, collections] = await Promise.all([getFilterOptions(), getCollections()]);
    res.json({ data: { ...filters, collections } });
  }),
);

catalogRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseWith(catalogItemCreateSchema, req.body);
    const { bookId, ...itemFields } = input;
    const item = await createItemForBook(bookId, itemFields);
    res.status(201).json({ data: item });
  }),
);

catalogRoutes.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = parseWith(updateItemSchema, req.body);
    const item = await updateCatalogItem(req.params.id!, input);
    res.json({ data: item });
  }),
);

catalogRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await removeCatalogItem(req.params.id!);
    res.json({ data: item });
  }),
);

catalogRoutes.post(
  '/:id/copies',
  asyncHandler(async (req, res) => {
    const item = await duplicateCatalogItem(req.params.id!);
    res.status(201).json({ data: item });
  }),
);
