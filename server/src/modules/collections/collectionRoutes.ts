import { Router } from 'express';
import {
  collectionSchema,
  updateCollectionSchema,
} from '../../schemas/bookSchemas.js';
import { parseWith } from '../../schemas/common.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  createCollection,
  editCollection,
  getCollections,
  removeCollection,
} from './collectionService.js';

export const collectionRoutes = Router();

collectionRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getCollections() });
  }),
);

collectionRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseWith(collectionSchema, req.body);
    const collection = await createCollection(input);
    res.status(201).json({ data: collection });
  }),
);

collectionRoutes.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = parseWith(updateCollectionSchema, req.body);
    const collection = await editCollection(req.params.id!, input);
    res.json({ data: collection });
  }),
);

collectionRoutes.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await removeCollection(req.params.id!);
    res.json({ data: result });
  }),
);
