import { ExternalServiceError, HttpError } from '../../utils/errors.js';
import { isbnReasonMessage, normalizeIsbn } from '../../utils/isbn.js';
import { hasExactIsbnMatch, mergeCandidates, rankCandidates } from './rank.js';
import { lookupGoogleByIsbn, searchGoogleBooks } from './googleBooks.js';
import { lookupOpenLibraryByIsbn, searchOpenLibrary } from './openLibrary.js';
import type { MetadataCandidate, MetadataLookupResult, MetadataReference } from './types.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown service error';
}

async function settleProviders(
  tasks: Array<{ label: string; promise: Promise<MetadataCandidate[]> }>,
): Promise<{ candidates: MetadataCandidate[]; warnings: string[]; successes: number }> {
  const results = await Promise.allSettled(tasks.map((task) => task.promise));
  const candidates: MetadataCandidate[] = [];
  const warnings: string[] = [];
  let successes = 0;

  results.forEach((result, index) => {
    const task = tasks[index];
    if (!task) return;
    if (result.status === 'fulfilled') {
      successes += 1;
      candidates.push(...result.value);
    } else {
      warnings.push(`${task.label} is unavailable right now: ${errorMessage(result.reason)}`);
    }
  });

  return { candidates, warnings, successes };
}

export async function lookupByIsbn(
  isbnInput: string,
  hints: { title?: string | null; author?: string | null } = {},
): Promise<MetadataLookupResult> {
  const normalized = normalizeIsbn(isbnInput);
  if (!normalized.valid) {
    throw new HttpError(422, 'INVALID_ISBN', isbnReasonMessage(normalized.reason), {
      isbn: isbnInput,
      reason: normalized.reason,
    });
  }

  const isbn = normalized.isbn13 ?? normalized.isbn10;
  if (!isbn) {
    throw new HttpError(422, 'INVALID_ISBN', 'The ISBN could not be normalized.');
  }

  const settled = await settleProviders([
    { label: 'Google Books', promise: lookupGoogleByIsbn(isbn) },
    { label: 'Open Library', promise: lookupOpenLibraryByIsbn(isbn) },
  ]);

  if (settled.successes === 0) {
    throw new ExternalServiceError(
      'metadata providers',
      'Book metadata services are currently unavailable. Please try again or enter the book manually.',
    );
  }

  const merged = mergeCandidates(settled.candidates);
  const exactExists = hasExactIsbnMatch(
    merged.map((candidate) => ({
      ...candidate,
      score: 100,
      confidence: 'high' as const,
      evidence: [],
    })),
    isbn,
  );

  const reference: MetadataReference = {
    isbn,
    title: hints.title ?? null,
    author: hints.author ?? null,
  };

  let candidates = rankCandidates(merged, reference);

  if (exactExists) {
    candidates = candidates.filter(
      (candidate) =>
        (normalized.isbn13 && candidate.isbn13 === normalized.isbn13) ||
        (normalized.isbn10 && candidate.isbn10 === normalized.isbn10),
    );
  } else if (candidates.length > 0) {
    settled.warnings.push(
      'No exact ISBN match was returned. Review the possible editions carefully before saving.',
    );
  }

  if (candidates.length === 0) {
    settled.warnings.push(
      'No book record was found for that ISBN. Check the number or enter the book manually.',
    );
  }

  return { candidates, warnings: settled.warnings };
}

export async function searchBooks(input: {
  title?: string | null;
  author?: string | null;
  query?: string | null;
}): Promise<MetadataLookupResult> {
  const title = input.title?.trim() || null;
  const author = input.author?.trim() || null;
  const query = input.query?.trim() || null;

  if (!title && !query) {
    throw new HttpError(400, 'SEARCH_QUERY_REQUIRED', 'Enter a title or search phrase.');
  }

  const settled = await settleProviders([
    {
      label: 'Google Books',
      promise: searchGoogleBooks({ title, author, query }),
    },
    {
      label: 'Open Library',
      promise: searchOpenLibrary({ title, author, query }),
    },
  ]);

  if (settled.successes === 0) {
    throw new ExternalServiceError(
      'metadata providers',
      'Book metadata services are currently unavailable. Please try again or enter the book manually.',
    );
  }

  const merged = mergeCandidates(settled.candidates);
  const candidates = rankCandidates(merged, {
    title: title ?? query,
    author,
    text: query,
  }).filter((candidate) => candidate.score >= 15 || candidate.confidence !== 'low');

  const limited = candidates.slice(0, 20);

  if (limited.length === 0) {
    settled.warnings.push(
      'No metadata matches were found. Try a more specific title and author, or enter the book manually.',
    );
  }

  return { candidates: limited, warnings: settled.warnings };
}
