import fs from 'node:fs/promises';
import path from 'node:path';
import { storageDirs } from '../config.js';

const ALLOWED_COVER_HOSTS = new Set([
  'books.google.com',
  'books.googleusercontent.com',
  'covers.openlibrary.org',
  'openlibrary.org',
  'archive.org',
]);

export function normalizeRemoteCoverUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const allowed =
      ALLOWED_COVER_HOSTS.has(host) ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.archive.org');
    if (!allowed) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

export function isLocalCoverUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\/uploads\/covers\/[A-Za-z0-9_-]+\.webp$/.test(value);
}

export function resolveLocalCover(value: string): string | null {
  if (!isLocalCoverUrl(value)) return null;
  const fileName = path.basename(value);
  const resolved = path.join(storageDirs.covers, fileName);
  if (!resolved.startsWith(path.resolve(storageDirs.covers) + path.sep)) return null;
  return resolved;
}

export async function removeLocalCover(value: string | null | undefined): Promise<void> {
  if (!value) return;
  const localPath = resolveLocalCover(value);
  if (!localPath) return;
  await fs.rm(localPath, { force: true });
}

export function sanitizeCoverForStorage(
  value: string | null | undefined,
  provider?: string | null,
): { url: string; source: string } | null {
  if (!value) return null;
  if (isLocalCoverUrl(value)) {
    return { url: value, source: provider ?? 'upload' };
  }
  const remote = normalizeRemoteCoverUrl(value);
  if (!remote) return null;
  return { url: remote, source: provider ?? 'external' };
}
