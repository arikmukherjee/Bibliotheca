import { normalizeIsbn } from '../../utils/isbn.js';
import { bestAuthorSimilarity, similarity } from '../../utils/text.js';
import type {
  CandidateMatch,
  Confidence,
  MetadataCandidate,
  MetadataReference,
  MetadataSourceRef,
} from './types.js';
import { PROVIDER_LABELS } from './types.js';

function uniqueSources(sources: MetadataSourceRef[]): MetadataSourceRef[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.provider}:${source.providerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeTwo(primary: MetadataCandidate, secondary: MetadataCandidate): MetadataCandidate {
  return {
    ...primary,
    subtitle: primary.subtitle ?? secondary.subtitle,
    authors: primary.authors.length ? primary.authors : secondary.authors,
    isbn10: primary.isbn10 ?? secondary.isbn10,
    isbn13: primary.isbn13 ?? secondary.isbn13,
    publisher: primary.publisher ?? secondary.publisher,
    publicationDate: primary.publicationDate ?? secondary.publicationDate,
    publicationYear: primary.publicationYear ?? secondary.publicationYear,
    edition: primary.edition ?? secondary.edition,
    language: primary.language ?? secondary.language,
    pageCount: primary.pageCount ?? secondary.pageCount,
    description:
      (primary.description?.length ?? 0) >= (secondary.description?.length ?? 0)
        ? primary.description
        : secondary.description,
    subjects: [...new Set([...primary.subjects, ...secondary.subjects])],
    seriesTitle: primary.seriesTitle ?? secondary.seriesTitle,
    seriesVolume: primary.seriesVolume ?? secondary.seriesVolume,
    tableOfContents: primary.tableOfContents ?? secondary.tableOfContents,
    originalPublicationDate: primary.originalPublicationDate ?? secondary.originalPublicationDate,
    coverImageUrl: primary.coverImageUrl ?? secondary.coverImageUrl,
    coverImageSource: primary.coverImageUrl
      ? primary.coverImageSource
      : secondary.coverImageSource,
    externalUrl: primary.externalUrl ?? secondary.externalUrl,
    recordType: primary.recordType === 'edition' || secondary.recordType === 'edition' ? 'edition' : 'work',
    sources: uniqueSources([...primary.sources, ...secondary.sources]),
  };
}

export function mergeCandidates(candidates: MetadataCandidate[]): MetadataCandidate[] {
  const merged: MetadataCandidate[] = [];
  const byIsbn = new Map<string, MetadataCandidate>();
  const seenIds = new Set<string>();

  for (const candidate of candidates) {
    if (seenIds.has(candidate.candidateId)) continue;
    seenIds.add(candidate.candidateId);

    const keys = [candidate.isbn13, candidate.isbn10].filter(
      (value): value is string => Boolean(value),
    );
    const existing = keys
      .map((key) => byIsbn.get(key))
      .find((value): value is MetadataCandidate => Boolean(value));

    if (existing) {
      const index = merged.indexOf(existing);
      const next = mergeTwo(existing, candidate);
      merged[index] = next;
      for (const key of [next.isbn13, next.isbn10, ...keys]) {
        if (key) byIsbn.set(key, next);
      }
    } else {
      merged.push(candidate);
      for (const key of keys) {
        byIsbn.set(key, candidate);
      }
    }
  }

  return merged;
}

function matchesIsbn(candidate: MetadataCandidate, isbn10: string | null, isbn13: string | null): boolean {
  if (isbn13 && candidate.isbn13 === isbn13) return true;
  if (isbn10 && candidate.isbn10 === isbn10) return true;
  return false;
}

function confidenceFor(exactIsbn: boolean, score: number, titleSimilarity: number): Confidence {
  if (exactIsbn) return 'high';
  if (score >= 55 && titleSimilarity >= 0.55) return 'medium';
  return 'low';
}

export function rankCandidates(
  candidates: MetadataCandidate[],
  reference: MetadataReference,
): CandidateMatch[] {
  const referenceIsbn = reference.isbn ? normalizeIsbn(reference.isbn) : null;
  const isbn10 = referenceIsbn?.valid ? referenceIsbn.isbn10 : null;
  const isbn13 = referenceIsbn?.valid ? referenceIsbn.isbn13 : null;

  const ranked = candidates.map((candidate) => {
    const exactIsbn = matchesIsbn(candidate, isbn10, isbn13);
    const titleSimilarity = reference.title
      ? similarity(candidate.title, reference.title)
      : 0;
    const authorSimilarity = reference.author
      ? bestAuthorSimilarity(candidate.authors, [reference.author])
      : 0;

    let score = 0;
    const evidence: string[] = [];

    if (exactIsbn) {
      score = 100;
      evidence.push('ISBN matches');
    } else {
      score += titleSimilarity * 60;
      score += authorSimilarity * 24;
      if (candidate.isbn13 ?? candidate.isbn10) score += 5;
      if (candidate.coverImageUrl) score += 3;
      if (candidate.sources.length > 1) score += 3;
      if (candidate.recordType === 'edition') score += 2;
      score = Math.min(97, Math.round(score));

      if (titleSimilarity >= 0.6) {
        evidence.push(`Title matches at ${Math.round(titleSimilarity * 100)}%`);
      }
      if (authorSimilarity >= 0.7) {
        evidence.push(`Author matches at ${Math.round(authorSimilarity * 100)}%`);
      }
    }

    if (candidate.isbn13 ?? candidate.isbn10) evidence.push('ISBN available');
    if (candidate.coverImageUrl) evidence.push('Cover available');
    if (candidate.recordType === 'work') {
      evidence.push('Work-level record — verify the exact edition');
    }
    for (const source of candidate.sources) {
      evidence.push(`Found in ${PROVIDER_LABELS[source.provider]}`);
    }

    return {
      ...candidate,
      score,
      confidence: confidenceFor(exactIsbn, score, titleSimilarity),
      evidence: [...new Set(evidence)],
    } satisfies CandidateMatch;
  });

  return ranked
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.confidence !== b.confidence) {
        const order: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
        return order[a.confidence] - order[b.confidence];
      }
      return a.title.localeCompare(b.title);
    })
    .slice(0, 25);
}

export function hasExactIsbnMatch(
  candidates: CandidateMatch[],
  isbn: string,
): boolean {
  const normalized = normalizeIsbn(isbn);
  if (!normalized.valid) return false;
  return candidates.some(
    (candidate) =>
      (normalized.isbn13 && candidate.isbn13 === normalized.isbn13) ||
      (normalized.isbn10 && candidate.isbn10 === normalized.isbn10),
  );
}
