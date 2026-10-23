import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getDashboardStats } from './statsService.js';

export const statsRoutes = Router();

statsRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await getDashboardStats() });
  }),
);
