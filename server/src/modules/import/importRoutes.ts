import { Router } from 'express';
import { z } from 'zod';
import { parseWith } from '../../schemas/common.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { importUpload, requireUploadedFile } from '../../middleware/upload.js';
import {
  commitImport,
  createImportPreview,
  getImportPreview,
} from './importService.js';

export const importRoutes = Router();

const commitSchema = z.object({
  mapping: z.record(z.string(), z.string().trim().min(1).nullable()),
  duplicateStrategy: z.enum(['add_copy', 'skip']).default('add_copy'),
  createMissingCollections: z.boolean().default(true),
});

importRoutes.post(
  '/preview',
  importUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = requireUploadedFile(req.file, 'Choose a CSV or XLSX file to import.');
    const preview = await createImportPreview(file);
    res.status(201).json({ data: preview });
  }),
);

importRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const preview = await getImportPreview(req.params.id!);
    res.json({ data: preview });
  }),
);

importRoutes.post(
  '/:id/commit',
  asyncHandler(async (req, res) => {
    const input = parseWith(commitSchema, req.body);
    const result = await commitImport(req.params.id!, input);
    res.json({ data: result });
  }),
);
