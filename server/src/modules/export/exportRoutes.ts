import { Router } from 'express';
import { z } from 'zod';
import { catalogQuerySchema } from '../../schemas/bookSchemas.js';
import { idSchema, parseWith } from '../../schemas/common.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { exportLimiter } from '../../middleware/rateLimit.js';
import { toCatalogFilters } from '../catalog/catalogFilters.js';
import { exportFileName, generateExport, type ExportFormat } from './exportService.js';

export const exportRoutes = Router();

const exportQuerySchema = catalogQuerySchema.extend({
  fileFormat: z.enum(['csv', 'xlsx', 'json', 'pdf']).default('csv'),
  ids: z.preprocess(
    (value) => {
      if (typeof value === 'string') {
        const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
        return entries.length > 0 ? entries : undefined;
      }
      return value;
    },
    z.array(idSchema).max(10_000).optional(),
  ),
});

exportRoutes.get(
  '/',
  exportLimiter,
  asyncHandler(async (req, res) => {
    const query = parseWith(exportQuerySchema, req.query);
    const file = await generateExport(
      query.fileFormat as ExportFormat,
      toCatalogFilters(query),
      query.ids,
    );
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFileName(file.extension)}"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  }),
);
