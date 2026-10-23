export type ItemFormat = 'physical' | 'digital';
export type ItemStatus =
  | 'owned'
  | 'reading'
  | 'loaned'
  | 'lost'
  | 'sold'
  | 'donated'
  | 'wishlist';
export type PhysicalCondition = 'new' | 'like_new' | 'very_good' | 'good' | 'fair' | 'poor';

export interface Book {
  id: string;
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
  tableOfContents: string | null;
  seriesTitle: string | null;
  seriesVolume: string | null;
  subjects: string[];
  coverImageUrl: string | null;
  coverImageSource: string | null;
  metadataSource: string | null;
  externalReference: string | null;
  externalUrl: string | null;
  originalPublicationDate: string | null;
  fieldSources: Record<string, string> | null;
  metadataRetrievedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookSummary {
  id: string;
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
  seriesTitle: string | null;
  seriesVolume: string | null;
  coverImageUrl: string | null;
  coverImageSource: string | null;
  metadataSource: string | null;
  createdAt: string;
}

export interface CatalogItem {
  id: string;
  bookId: string;
  itemCode: string;
  accessionNumber: string | null;
  acquisitionDate: string | null;
  acquisitionSource: string | null;
  purchasePrice: number | null;
  currency: string | null;
  shelfLocation: string | null;
  collectionId: string | null;
  physicalCondition: string | null;
  format: ItemFormat;
  itemStatus: string;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionSummary {
  id: string;
  name: string;
  color: string;
}

export interface CatalogEntry extends CatalogItem {
  book: BookSummary;
  collection: CollectionSummary | null;
  copyCount: number;
}

export interface BookDetail extends Book {
  items: CatalogEntry[];
  itemCount: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionWithCount extends Collection {
  itemCount: number;
  bookCount: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CatalogList {
  data: CatalogEntry[];
  pagination: Pagination;
}

export interface CatalogFilters {
  languages: string[];
  publishers: string[];
  years: number[];
  conditions: string[];
  statuses: string[];
  formats: string[];
  collections: CollectionWithCount[];
}

export interface DuplicateCandidate {
  book: BookSummary;
  itemCount: number;
  matchReason: 'isbn' | 'title_author' | 'title';
  similarity: number;
}

export interface ExistingBookRef {
  id: string;
  title: string;
  authors: string[];
  coverImageUrl: string | null;
  itemCount: number;
}

export type Confidence = 'high' | 'medium' | 'low';
export type MetadataProvider = 'google_books' | 'open_library';

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
  sources: Array<{ provider: MetadataProvider; providerId: string; url: string | null }>;
  score: number;
  confidence: Confidence;
  evidence: string[];
  existingBook?: ExistingBookRef | null;
}

export interface ExtractedIsbn {
  raw: string;
  isbn10: string | null;
  isbn13: string | null;
  valid: boolean;
  reason: string;
  source: 'barcode' | 'text';
  labelled: boolean;
}

export interface ImageIdentificationResult {
  extraction: {
    barcodeValues: string[];
    ocr: {
      available: boolean;
      confidence: number | null;
      textPreview: string;
      isbnCount: number;
    };
    extractedIsbns: ExtractedIsbn[];
    hints: {
      title: string | null;
      author: string | null;
      publisher: string | null;
      year: number | null;
      lineCount: number;
    };
  };
  candidates: MetadataCandidate[];
  warnings: string[];
  notes: string[];
  searchMode: 'isbn' | 'title' | 'none';
  usedIsbn: string | null;
}

export interface AttentionBook {
  book: BookSummary;
  itemCount: number;
}

export interface DashboardStats {
  totals: {
    books: number;
    items: number;
    collections: number;
    physical: number;
    digital: number;
    missingMetadata: number;
    missingCover: number;
    orphanedBooks: number;
  };
  health: {
    completeBooks: number;
    percentage: number;
  };
  collections: CollectionWithCount[];
  recentItems: CatalogEntry[];
  needsAttention: {
    missingMetadata: AttentionBook[];
    missingCover: AttentionBook[];
    orphanedBooks: AttentionBook[];
  };
  activity: Array<{
    id: number;
    action: string;
    summary: string;
    entityType: string;
    entityId: string | null;
    createdAt: string;
    details: unknown;
  }>;
}

export interface SettingsPayload {
  values: Record<string, string>;
  providers: {
    googleBooks: { configured: boolean; mode: 'api_key' | 'public_quota' };
    openLibrary: { configured: boolean; mode: 'public_api' };
    ocr: { enabled: boolean };
  };
  cache: { entries: number; lastFetchedAt: string | null };
  library: { bibliographicRecords: number; catalogItems: number };
}

export type ImportField =
  | 'title'
  | 'subtitle'
  | 'authors'
  | 'isbn'
  | 'isbn10'
  | 'isbn13'
  | 'publisher'
  | 'publicationDate'
  | 'publicationYear'
  | 'edition'
  | 'language'
  | 'pageCount'
  | 'description'
  | 'seriesTitle'
  | 'seriesVolume'
  | 'subjects'
  | 'format'
  | 'condition'
  | 'status'
  | 'collection'
  | 'shelfLocation'
  | 'accessionNumber'
  | 'acquisitionDate'
  | 'acquisitionSource'
  | 'purchasePrice'
  | 'currency'
  | 'tags'
  | 'notes';

export type ColumnMapping = Partial<Record<ImportField, string | null>>;

export interface ImportPreview {
  importId: string;
  originalName: string;
  fileType: string;
  headers: string[];
  rowCount: number;
  preview: Array<Record<string, string>>;
  suggestedMapping: ColumnMapping;
  availableFields: ImportField[];
}

export interface ImportCommitResult {
  importId: string;
  processed: number;
  createdBooks: number;
  addedCopies: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  warnings: string[];
}

export interface BookPayload {
  title: string;
  subtitle?: string | null;
  authors?: string[];
  isbn10?: string | null;
  isbn13?: string | null;
  publisher?: string | null;
  publicationDate?: string | null;
  publicationYear?: number | null;
  edition?: string | null;
  language?: string | null;
  pageCount?: number | null;
  description?: string | null;
  tableOfContents?: string | null;
  seriesTitle?: string | null;
  seriesVolume?: string | null;
  subjects?: string[];
  coverImageUrl?: string | null;
  coverImageSource?: string | null;
  metadataSource?: string | null;
  externalReference?: string | null;
  externalUrl?: string | null;
  originalPublicationDate?: string | null;
  metadataRetrievedAt?: string | null;
  fieldSources?: Record<string, string> | null;
  duplicateAcknowledged?: boolean;
}

export interface ItemPayload {
  accessionNumber?: string | null;
  acquisitionDate?: string | null;
  acquisitionSource?: string | null;
  purchasePrice?: number | null;
  currency?: string | null;
  shelfLocation?: string | null;
  collectionId?: string | null;
  physicalCondition?: PhysicalCondition | null;
  format?: ItemFormat;
  itemStatus?: ItemStatus;
  notes?: string | null;
  tags?: string[];
}

export interface CreateBookPayload {
  book: BookPayload;
  item?: ItemPayload;
  duplicateAcknowledged?: boolean;
}

export interface CreateBookResult {
  book: Book;
  item: CatalogEntry;
}
