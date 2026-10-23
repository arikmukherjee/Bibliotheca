import { createHash } from 'node:crypto';
import { config } from '../../config.js';
import { fetchJson } from '../../utils/http.js';
import { normalizeIsbn, cleanIsbn } from '../../utils/isbn.js';
import { normalizeRemoteCoverUrl } from '../../utils/covers.js';
import { parseYear } from '../../utils/text.js';
import { cachedLookup } from './cache.js';
import type { MetadataCandidate } from './types.js';

interface GoogleIndustryIdentifier {
  type?: string;
  identifier?: string;
}

interface GoogleVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: GoogleIndustryIdentifier[];
  pageCount?: number;
  categories?: string[];
  language?: string;
  imageLinks?: {
    smallThumbnail?: string;
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    extraLarge?: string;
  };
  infoLink?: string;
  canonicalVolumeLink?: string;
}

interface GoogleVolume {
  id: string;
  volumeInfo?: GoogleVolumeInfo;
}

interface GoogleResponse {
  totalItems?: number;
  items?: GoogleVolume[];
  error?: { message?: string };
}

function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 20): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, limit);
}

function mapVolume(volume: GoogleVolume): MetadataCandidate | null {
  const info = volume.volumeInfo;
  if (!info?.title) return null;

  let isbn10: string | null = null;
  let isbn13: string | null = null;
  for (const identifier of info.industryIdentifiers ?? []) {
    if (!identifier.identifier) continue;
    const normalized = normalizeIsbn(identifier.identifier);
    if (!normalized.valid) continue;
    if (normalized.isbn13) isbn13 = normalized.isbn13;
    else if (normalized.isbn10 && !isbn10) isbn10 = normalized.isbn10;
  }
  if (!isbn10 && info.industryIdentifiers) {
    const maybeIsbn10 = info.industryIdentifiers.find((item) => item.type === 'ISBN_10');
    if (maybeIsbn10?.identifier) {
      const normalized = normalizeIsbn(cleanIsbn(maybeIsbn10.identifier));
      if (normalized.isbn10) isbn10 = normalized.isbn10;
    }
  }

  const cover =
    normalizeRemoteCoverUrl(
      info.imageLinks?.thumbnail ??
        info.imageLinks?.smallThumbnail ??
        info.imageLinks?.small ??
        info.imageLinks?.medium ??
        info.imageLinks?.large ??
        info.imageLinks?.extraLarge,
    ) ?? null;

  const externalUrl = info.canonicalVolumeLink ?? info.infoLink ?? `https://books.google.com/books?id=${volume.id}`;
  const publicationDate = info.publishedDate?.trim() || null;
  const pageCount = info.pageCount && info.pageCount > 0 ? Math.round(info.pageCount) : null;
  const authors = uniqueStrings(info.authors ?? []);

  return {
    candidateId: `google:${volume.id}`,
    title: info.title.trim(),
    subtitle: info.subtitle?.trim() || null,
    authors,
    isbn10,
    isbn13,
    publisher: info.publisher?.trim() || null,
    publicationDate,
    publicationYear: parseYear(publicationDate),
    edition: null,
    language: info.language?.trim() || null,
    pageCount,
    description: stripHtml(info.description),
    subjects: uniqueStrings(info.categories ?? []),
    seriesTitle: null,
    seriesVolume: null,
    tableOfContents: null,
    originalPublicationDate: null,
    coverImageUrl: cover,
    coverImageSource: cover ? 'google_books' : null,
    primaryProvider: 'google_books',
    primaryProviderId: volume.id,
    externalUrl,
    recordType: 'edition',
    sources: [{ provider: 'google_books', providerId: volume.id, url: externalUrl }],
  };
}

function googleUrl(params: Record<string, string>): string {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (config.googleBooksApiKey) {
    url.searchParams.set('key', config.googleBooksApiKey);
  }
  return url.toString();
}

function cacheKey(kind: string, value: string): string {
  const hash = createHash('sha1').update(value).digest('hex');
  return `google_books:${kind}:${hash}`;
}

export async function lookupGoogleByIsbn(isbn: string): Promise<MetadataCandidate[]> {
  const params = {
    q: `isbn:${isbn}`,
    maxResults: '10',
    printType: 'books',
    projection: 'full',
  };
  return cachedLookup(cacheKey('isbn', isbn), 'google_books', async () => {
    const response = await fetchJson<GoogleResponse>(googleUrl(params), 'Google Books');
    return (response.items ?? [])
      .map(mapVolume)
      .filter((candidate): candidate is MetadataCandidate => Boolean(candidate));
  });
}

export async function searchGoogleBooks(input: {
  title?: string | null;
  author?: string | null;
  query?: string | null;
}): Promise<MetadataCandidate[]> {
  const title = input.title?.trim();
  const author = input.author?.trim();
  const query = input.query?.trim();

  let q: string;
  if (title) {
    const cleanTitle = title.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
    q = `intitle:"${cleanTitle}"`;
    if (author) {
      const cleanAuthor = author.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
      q += ` inauthor:"${cleanAuthor}"`;
    }
  } else if (query) {
    q = query.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  } else {
    return [];
  }

  const params = {
    q,
    maxResults: '20',
    printType: 'books',
    projection: 'full',
  };

  return cachedLookup(cacheKey('search', q), 'google_books', async () => {
    const response = await fetchJson<GoogleResponse>(googleUrl(params), 'Google Books');
    return (response.items ?? [])
      .map(mapVolume)
      .filter((candidate): candidate is MetadataCandidate => Boolean(candidate));
  });
}
