import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { ExternalServiceError, HttpError, isHttpError } from '../utils/errors.js';

interface MysqlError extends Error {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

function mysqlMessage(error: MysqlError): { status: number; code: string; message: string } | null {
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      return {
        status: 409,
        code: 'DUPLICATE',
        message:
          error.message.includes('uq_catalog_accession') || error.message.includes('accession')
            ? 'That accession number is already in use.'
            : error.message.includes('collections')
              ? 'A collection with that name already exists.'
              : 'That value must be unique and is already in use.',
      };
    case 'ER_ROW_IS_REFERENCED_2':
      return {
        status: 409,
        code: 'IN_USE',
        message: 'This record is still referenced by other catalog data and cannot be deleted.',
      };
    case 'ER_NO_REFERENCED_ROW_2':
      return {
        status: 400,
        code: 'INVALID_REFERENCE',
        message: 'A referenced record (such as a collection) no longer exists.',
      };
    case 'ER_DATA_TOO_LONG':
      return { status: 422, code: 'VALUE_TOO_LONG', message: 'One of the values is too long.' };
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
      return {
        status: 503,
        code: 'DATABASE_UNAVAILABLE',
        message:
          'The library database is unavailable. Check that MySQL is running and that migrations have been applied.',
      };
    default:
      return null;
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No API route matches ${req.method} ${req.originalUrl}.`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields need attention.',
        details: {
          fields: error.flatten().fieldErrors,
          formErrors: error.flatten().formErrors,
        },
      },
    });
    return;
  }

  if (isHttpError(error)) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `The file is larger than the ${config.maxUploadMb} MB limit.`
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field. Upload a single file using the indicated field.'
          : 'The upload could not be processed.';
    res.status(status).json({ error: { code: error.code, message } });
    return;
  }

  if (error instanceof ExternalServiceError) {
    res.status(502).json({
      error: {
        code: 'EXTERNAL_SERVICE_ERROR',
        message: error.message,
        details: { service: error.service },
      },
    });
    return;
  }

  const mysql = mysqlMessage(error as MysqlError);
  if (mysql) {
    res.status(mysql.status).json({ error: { code: mysql.code, message: mysql.message } });
    return;
  }

  if ((error as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' },
    });
    return;
  }

  if ((error as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
    });
    return;
  }

  console.error('Unhandled API error:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction
        ? 'Something went wrong while processing the request.'
        : error instanceof Error
          ? error.message
          : 'Unknown server error.',
    },
  });
};
