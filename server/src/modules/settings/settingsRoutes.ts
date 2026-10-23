import { Router } from 'express';
import { settingsSchema } from '../../schemas/bookSchemas.js';
import { parseWith } from '../../schemas/common.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { clearMetadataCache, getSettingsPayload, updateSettings } from './settingsService.js';

export const settingsRoutes = Router();

settingsRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getSettingsPayload() });
  }),
);

settingsRoutes.patch(
  '/',
  asyncHandler(async (req, res) => {
    const input = parseWith(settingsSchema, req.body);
    await updateSettings(input);
    res.json({ data: await getSettingsPayload() });
  }),
);

settingsRoutes.post(
  '/cache/clear',
  asyncHandler(async (_req, res) => {
    const removed = await clearMetadataCache();
    res.json({ data: { removed } });
  }),
);
