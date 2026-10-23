import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

function limiter(options: {
  windowMs: number;
  limit: number;
  message: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: options.message,
        },
      });
    },
  });
}

export const identifyLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: config.identifyRateLimit,
  message:
    'Too many identification attempts. Please wait a few minutes before trying more images.',
});

export const exportLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: config.exportRateLimit,
  message: 'Too many export requests. Please wait a few minutes and try again.',
});
