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

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionSummary {
  id: string;
  name: string;
  color: string;
}

export interface CollectionWithCount extends Collection {
  itemCount: number;
  bookCount: number;
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
  format: 'physical' | 'digital';
  itemStatus: string;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
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

export interface DuplicateCandidate {
  book: BookSummary;
  itemCount: number;
  matchReason: 'isbn' | 'title_author' | 'title';
  similarity: number;
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

export interface ItemInput {
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

export interface CatalogFilters {
  q?: string;
  collectionId?: string;
  format?: ItemFormat;
  condition?: PhysicalCondition;
  status?: ItemStatus;
  language?: string;
  publisher?: string;
  yearFrom?: number;
  yearTo?: number;
  missingCover?: boolean;
  missingMetadata?: boolean;
  addedFrom?: string;
  addedTo?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
