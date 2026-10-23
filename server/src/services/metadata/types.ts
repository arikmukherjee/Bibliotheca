export type MetadataProvider = 'google_books' | 'open_library';

export type Confidence = 'high' | 'medium' | 'low';

export interface MetadataSourceRef {
  provider: MetadataProvider;
  providerId: string;
  url: string | null;
}

export interface MetadataCandidate {
  candidateId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn10: string | null;
  isbn13: string | null;
  publisher: string | null;
  publicationDate: string | null;
  publicationYear: number | null;
  edition: string | null;
  language: string | null;
  pageCount: number | null;
  description: string | null;
  subjects: string[];
  seriesTitle: string | null;
  seriesVolume: string | null;
  tableOfContents: string | null;
  originalPublicationDate: string | null;
  coverImageUrl: string | null;
  coverImageSource: string | null;
  primaryProvider: MetadataProvider;
  primaryProviderId: string;
  externalUrl: string | null;
  recordType: 'edition' | 'work';
  sources: MetadataSourceRef[];
}

export interface CandidateMatch extends MetadataCandidate {
  score: number;
  confidence: Confidence;
  evidence: string[];
  existingBook?: {
    id: string;
    title: string;
    authors: string[];
    coverImageUrl: string | null;
    itemCount: number;
  } | null;
}

export interface MetadataReference {
  isbn?: string | null;
  title?: string | null;
  author?: string | null;
  text?: string | null;
}

export interface MetadataLookupResult {
  candidates: CandidateMatch[];
  warnings: string[];
}

export const PROVIDER_LABELS: Record<MetadataProvider, string> = {
  google_books: 'Google Books',
  open_library: 'Open Library',
};

export function providerSourceLabel(provider: MetadataProvider): string {
  return PROVIDER_LABELS[provider];
}
