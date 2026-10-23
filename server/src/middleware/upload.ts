import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../utils/errors.js';
import { ALLOWED_IMAGE_MIME_TYPES, ALLOWED_IMPORT_MIME_TYPES } from '../utils/files.js';

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(new HttpError(400, 'INVALID_FILE_TYPE', 'Only JPG, PNG and WebP images are supported.'));
      return;
    }
    callback(null, true);
  },
});

export const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(config.maxUploadBytes, 8 * 1024 * 1024),
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (
      !ALLOWED_IMPORT_MIME_TYPES.has(file.mimetype) &&
      !['csv', 'xlsx'].includes(extension ?? '')
    ) {
      callback(new HttpError(400, 'INVALID_FILE_TYPE', 'Upload a CSV or XLSX file.'));
      return;
    }
    callback(null, true);
  },
});

export function requireUploadedFile(
  file: Express.Multer.File | undefined,
  message = 'Upload an image to continue.',
): Express.Multer.File {
  if (!file) {
    throw new HttpError(400, 'FILE_REQUIRED', message);
  }
  return file;
}
