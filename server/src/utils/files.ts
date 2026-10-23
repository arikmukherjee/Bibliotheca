import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { storageDirs } from '../config.js';
import { HttpError } from './errors.js';
import { newId } from './ids.js';

export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(storageDirs.root, { recursive: true }),
    fs.mkdir(storageDirs.covers, { recursive: true }),
    fs.mkdir(storageDirs.temp, { recursive: true }),
    fs.mkdir(storageDirs.tesseract, { recursive: true }),
  ]);
}

export async function validateImage(file: Express.Multer.File): Promise<sharp.Metadata> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new HttpError(400, 'INVALID_FILE_TYPE', 'Only JPG, PNG and WebP images are supported.');
  }

  try {
    const metadata = await sharp(file.buffer, {
      limitInputPixels: 40_000_000,
      failOn: 'error',
    }).metadata();

    if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
      throw new Error('Unexpected image format');
    }
    if (!metadata.width || !metadata.height || metadata.width < 60 || metadata.height < 60) {
      throw new HttpError(400, 'IMAGE_TOO_SMALL', 'The image is too small to read. Use a larger photo.');
    }
    return metadata;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'INVALID_IMAGE', 'The file could not be read as a valid image.');
  }
}

export async function saveCoverImage(buffer: Buffer): Promise<string> {
  await fs.mkdir(storageDirs.covers, { recursive: true });
  const fileName = `${newId()}.webp`;
  const target = path.join(storageDirs.covers, fileName);

  await sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
    .rotate()
    .resize({ width: 1000, height: 1500, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(target);

  return `/uploads/covers/${fileName}`;
}

export function safeExtension(fileName: string, fallback: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,6}$/.test(extension) ? extension : fallback;
}
