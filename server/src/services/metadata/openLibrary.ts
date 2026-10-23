import { createHash } from 'node:crypto';
import { fetchJson } from '../../utils/http.js';
import { normalizeIsbn, cleanIsbn } from '../../utils/isbn.js';
import { normalizeRemoteCoverUrl } from '../../utils/covers.js';
import { parseYear } from '../../utils/text.js';
import { cachedLookup } from './cache.js';
import type { MetadataCandidate } from './types.js';

interface OpenLibraryName {
  name?: string;
}

interface OpenLibraryBookData {
  title?: string;
  subtitle?: string;
  authors?: OpenLibraryName[];
  publishers?: OpenLibraryName[];
  publish_date?: string;
  number_of_pages?: number;
  identifiers?: {
    isbn_10?: string[];
    isbn_13?: string[];
  };
  cover?: {
    small?: string;
    medium?: string;
    large?: string;
  };
  subjects?: OpenLibraryName[];
  url?: string;
  table_of_contents?: Array<{ title?: string; label?: string; pagenum?: string }>;
  description?: string | { value?: string };
  languages?: Array<{ key?: string }>;
}

interface OpenLibrarySearchDoc {
  key: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  publisher?: string[];
  cover_i?: number;
  language?: string[];
  subject?: string[];
  number_of_pages_median?: number;
  edition_count?: number;
}

interface OpenLibrarySearchResponse {
  numFound?: number;
  docs?: OpenLibrarySearchDoc[];
}

const LANGUAGE_MAP: Record<string, string> = {
  eng: 'en',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  jpn: 'ja',
  chi: 'zh',
  zho: 'zh',
  ara: 'ar',
  hin: 'hi',
  dut: 'nl',
  nld: 'nl',
  swe: 'sv',
  pol: 'pl',
  tur: 'tr',
  kor: 'ko',
};

function normalizeLanguage(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return LANGUAGE_MAP[trimmed.toLowerCase()] ?? trimmed;
}

function languageFromKey(key: string | undefined): string | null {
  if (!key) return null;
  const code = key.split('/').filter(Boolean).at(-1);
  return normalizeLanguage(code);
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

function tableOfContents(
  entries: Array<{ title?: string; label?: string; pagenum?: string }> | undefined,
): string | null {
  if (!entries || entries.length === 0) return null;
  return entries
    .map((entry) => {
      const title = entry.title?.trim();
      if (!title) return null;
      return entry.pagenum ? `${title} — ${entry.pagenum}` : title;
    })
    .filter(Boolean)
    .join('\n');
}

function description(value: string | { value?: string } | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value.value?.trim() || null;
}

function chooseIsbns(values: string[] | undefined): { isbn10: string | null; isbn13: string | null } {
  let isbn10: string | null = null;
  let isbn13: string | null = null;
  for (const value of values ?? []) {
    const normalized = normalizeIsbn(cleanIsbn(value));
    if (!normalized.valid) continue;
    if (normalized.isbn13) isbn13 = isbn13 ?? normalized.isbn13;
    if (normalized.isbn10) isbn10 = isbn10 ?? normalized.isbn10;
  }
  return { isbn10, isbn13 };
}

function mapBook(isbn: string, data: OpenLibraryBookData): MetadataCandidate | null {
  if (!data.title) return null;
  const { isbn10, isbn13 } = chooseIsbns([
    ...(data.identifiers?.isbn_13 ?? []),
    ...(data.identifiers?.isbn_10 ?? []),
    isbn,
  ]);
  const cover = normalizeRemoteCoverUrl(data.cover?.large ?? data.cover?.medium ?? data.cover?.small);
  const externalUrl = data.url ?? `https://openlibrary.org/isbn/${isbn13 ?? isbn10 ?? isbn}`;
  const publicationDate = data.publish_date?.trim() || null;
  const languages = data.languages ?? [];
  const firstLanguage = languages[0]?.key ? languageFromKey(languages[0].key) : null;

  return {
    candidateId: `openlibrary:${isbn13 ?? isbn10 ?? isbn}`,
    title: data.title.trim(),
    subtitle: data.subtitle?.trim() || null,
    authors: uniqueStrings((data.authors ?? []).map((author) => author.name)),
    isbn10,
    isbn13,
    publisher: data.publishers?.[0]?.name?.trim() || null,
    publicationDate,
    publicationYear: parseYear(publicationDate),
    edition: null,
    language: firstLanguage,
    pageCount:
      data.number_of_pages && data.number_of_pages > 0 ? Math.round(data.number_of_pages) : null,
    description: description(data.description),
    subjects: uniqueStrings((data.subjects ?? []).map((subject) => subject.name)),
    seriesTitle: null,
    seriesVolume: null,
    tableOfContents: tableOfContents(data.table_of_contents),
    originalPublicationDate: null,
    coverImageUrl: cover,
    coverImageSource: cover ? 'open_library' : null,
    primaryProvider: 'open_library',
    primaryProviderId: isbn13 ?? isbn10 ?? isbn,
    externalUrl,
    recordType: 'edition',
    sources: [{ provider: 'open_library', providerId: isbn13 ?? isbn10 ?? isbn, url: externalUrl }],
  };
}

function cacheKey(kind: string, value: string): string {
  const hash = createHash('sha1').update(value).digest('hex');
  return `open_library:${kind}:${hash}`;
}

export async function lookupOpenLibraryByIsbn(isbn: string): Promise<MetadataCandidate[]> {
  return cachedLookup(cacheKey('isbn', isbn), 'open_library', async () => {
    const url = new URL('https://openlibrary.org/api/books');
    url.searchParams.set('bibkeys', `ISBN:${isbn}`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('jscmd', 'data');
    const response = await fetchJson<Record<string, OpenLibraryBookData>>(url.toString(), 'Open Library');
    return Object.values(response)
      .map((data) => mapBook(isbn, data))
      .filter((candidate): candidate is MetadataCandidate => Boolean(candidate));
  });
}

export async function searchOpenLibrary(input: {
  title?: string | null;
  author?: string | null;
  query?: string | null;
}): Promise<MetadataCandidate[]> {
  const title = input.title?.trim();
  const author = input.author?.trim();
  const query = input.query?.trim();
  if (!title && !query) return [];

  const url = new URL('https://openlibrary.org/search.json');
  if (title) url.searchParams.set('title', title);
  else if (query) url.searchParams.set('q', query);
  if (author) url.searchParams.set('author', author);
  url.searchParams.set('limit', '20');
  url.searchParams.set(
    'fields',
    [
      'key',
      'title',
      'subtitle',
      'author_name',
      'first_publish_year',
      'isbn',
      'publisher',
      'cover_i',
      'language',
      'subject',
      'number_of_pages_median',
      'edition_count',
    ].join(','),
  );

  const cacheId = `${title ?? ''}|${author ?? ''}|${query ?? ''}`;

  return cachedLookup(cacheKey('search', cacheId), 'open_library', async () => {
    const response = await fetchJson<OpenLibrarySearchResponse>(url.toString(), 'Open Library');
    return (response.docs ?? [])
      .map((doc) => mapSearchDoc(doc))
      .filter((candidate): candidate is MetadataCandidate => Boolean(candidate));
  });
}

function mapSearchDoc(doc: OpenLibrarySearchDoc): MetadataCandidate | null {
  if (!doc.title || !doc.key) return null;
  const { isbn10, isbn13 } = chooseIsbns(doc.isbn);
  const cover = doc.cover_i
    ? normalizeRemoteCoverUrl(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`)
    : null;
  const externalUrl = `https://openlibrary.org${doc.key}`;
  const publicationYear =
    doc.first_publish_year && doc.first_publish_year >= 1000 && doc.first_publish_year <= 2200
      ? doc.first_publish_year
      : null;
  const language = normalizeLanguage(doc.language?.[0]);
  const providerId = doc.key;

  return {
    candidateId: `openlibrary:${providerId}`,
    title: doc.title,
    subtitle: doc.subtitle?.trim() || null,
    authors: uniqueStrings(doc.author_name ?? []),
    isbn10,
    isbn13,
    publisher: doc.publisher?.[0]?.trim() || null,
    publicationDate: publicationYear ? String(publicationYear) : null,
    publicationYear,
    edition: null,
    language,
    pageCount:
      doc.number_of_pages_median && doc.number_of_pages_median > 0
        ? Math.round(doc.number_of_pages_median)
        : null,
    description: null,
    subjects: uniqueStrings(doc.subject ?? [], 12),
    seriesTitle: null,
    seriesVolume: null,
    tableOfContents: null,
    originalPublicationDate: null,
    coverImageUrl: cover,
    coverImageSource: cover ? 'open_library' : null,
    primaryProvider: 'open_library',
    primaryProviderId: providerId,
    externalUrl,
    recordType: 'work',
    sources: [{ provider: 'open_library', providerId, url: externalUrl }],
  };
}
