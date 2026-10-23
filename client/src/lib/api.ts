import type {
  Book,
  BookDetail,
  BookPayload,
  CatalogEntry,
  CatalogFilters,
  CatalogList,
  Collection,
  CollectionWithCount,
  CreateBookPayload,
  CreateBookResult,
  DashboardStats,
  DuplicateCandidate,
  ExistingBookRef,
  ImageIdentificationResult,
  ImportCommitResult,
  ImportPreview,
  ItemPayload,
  MetadataCandidate,
  SettingsPayload,
} from './types';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the Bibliotheca server. Check that it is running.',
    );
  }

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Ignore non-JSON errors.
    }
    throw new ApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? `The request failed (HTTP ${response.status}).`,
      body.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(params: Record<string, QueryValue | QueryValue[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      const entries = value.filter((entry) => entry !== undefined && entry !== null && entry !== '');
      if (entries.length > 0) search.set(key, entries.map(String).join(','));
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

function dataOf<T>(response: { data: T }): T {
  return response.data;
}

export interface SearchResponse {
  data: MetadataCandidate[];
  warnings: string[];
}

export interface IsbnLookupResponse {
  data: {
    candidates: MetadataCandidate[];
    warnings: string[];
    existingBook: (ExistingBookRef & { itemCount: number }) | null;
  };
  warnings: string[];
}

export interface IdentifyImageResponse {
  data: ImageIdentificationResult;
  warnings: string[];
  notes: string[];
}

export interface CreateBookResponse {
  data: CreateBookResult;
  warnings: string[];
}

export interface BookConflictDetails {
  duplicates?: DuplicateCandidate[];
  existingBook?: ExistingBookRef & { itemCount: number };
  itemCount?: number;
}

export const api = {
  getStats: async (): Promise<DashboardStats> =>
    dataOf(await requestJson<{ data: DashboardStats }>('/stats')),

  listCatalog: (params: Record<string, QueryValue | QueryValue[]>): Promise<CatalogList> =>
    requestJson<CatalogList>(`/catalog${buildQuery(params)}`),

  getCatalogFilters: async (): Promise<CatalogFilters> =>
    dataOf(await requestJson<{ data: CatalogFilters }>('/catalog/filters')),

  getBook: async (id: string): Promise<BookDetail> =>
    dataOf(await requestJson<{ data: BookDetail }>(`/books/${id}`)),

  searchMetadata: (params: {
    q?: string;
    title?: string;
    author?: string;
  }): Promise<SearchResponse> => requestJson<SearchResponse>(`/books/search${buildQuery(params)}`),

  lookupIsbn: (body: { isbn: string; title?: string; author?: string }): Promise<IsbnLookupResponse> =>
    requestJson<IsbnLookupResponse>('/identify/isbn', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  identifyImage: async (file: File): Promise<ImageIdentificationResult> => {
    const form = new FormData();
    form.append('image', file);
    const response = await requestJson<IdentifyImageResponse>('/identify/image', {
      method: 'POST',
      body: form,
    });
    return response.data;
  },

  getDuplicates: (params: {
    isbn?: string;
    title?: string;
    author?: string;
    excludeBookId?: string;
  }): Promise<DuplicateCandidate[]> =>
    requestJson<{ data: DuplicateCandidate[] }>(
      `/books/duplicates${buildQuery(params)}`,
    ).then(dataOf),

  createBook: (payload: CreateBookPayload): Promise<CreateBookResponse> =>
    requestJson<CreateBookResponse>('/books', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBook: async (id: string, payload: Partial<BookPayload>): Promise<Book> =>
    dataOf(
      await requestJson<{ data: Book }>(`/books/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    ),

  deleteBook: (id: string): Promise<{ book: Book; itemCount: number }> =>
    requestJson<{ data: { book: Book; itemCount: number } }>(`/books/${id}`, {
      method: 'DELETE',
    }).then(dataOf),

  createBookItem: async (bookId: string, payload: ItemPayload): Promise<CatalogEntry> =>
    dataOf(
      await requestJson<{ data: CatalogEntry }>(`/books/${bookId}/items`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    ),

  updateCatalogItem: async (id: string, payload: ItemPayload): Promise<CatalogEntry> =>
    dataOf(
      await requestJson<{ data: CatalogEntry }>(`/catalog/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    ),

  deleteCatalogItem: async (id: string): Promise<CatalogEntry> =>
    dataOf(
      await requestJson<{ data: CatalogEntry }>(`/catalog/${id}`, {
        method: 'DELETE',
      }),
    ),

  duplicateCatalogItem: async (id: string): Promise<CatalogEntry> =>
    dataOf(
      await requestJson<{ data: CatalogEntry }>(`/catalog/${id}/copies`, {
        method: 'POST',
      }),
    ),

  uploadCover: async (file: File): Promise<{ url: string; source: string }> => {
    const form = new FormData();
    form.append('image', file);
    return dataOf(
      await requestJson<{ data: { url: string; source: string } }>('/uploads/cover', {
        method: 'POST',
        body: form,
      }),
    );
  },

  getCollections: async (): Promise<CollectionWithCount[]> =>
    dataOf(await requestJson<{ data: CollectionWithCount[] }>('/collections')),

  createCollection: async (payload: {
    name: string;
    description?: string | null;
    color: string;
  }): Promise<Collection> =>
    dataOf(
      await requestJson<{ data: Collection }>('/collections', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    ),

  updateCollection: async (
    id: string,
    payload: { name?: string; description?: string | null; color?: string },
  ): Promise<Collection> =>
    dataOf(
      await requestJson<{ data: Collection }>(`/collections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    ),

  deleteCollection: (id: string): Promise<{ collection: Collection; itemsUncategorized: number }> =>
    requestJson<{ data: { collection: Collection; itemsUncategorized: number } }>(
      `/collections/${id}`,
      { method: 'DELETE' },
    ).then(dataOf),

  getSettings: async (): Promise<SettingsPayload> =>
    dataOf(await requestJson<{ data: SettingsPayload }>('/settings')),

  updateSettings: async (payload: {
    library_name?: string;
    default_currency?: string;
    default_format?: string;
    default_condition?: string;
  }): Promise<SettingsPayload> =>
    dataOf(
      await requestJson<{ data: SettingsPayload }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    ),

  clearCache: async (): Promise<number> =>
    dataOf(
      await requestJson<{ data: { removed: number } }>('/settings/cache/clear', {
        method: 'POST',
      }),
    ).removed,

  importPreview: async (file: File): Promise<ImportPreview> => {
    const form = new FormData();
    form.append('file', file);
    return dataOf(
      await requestJson<{ data: ImportPreview }>('/import/preview', {
        method: 'POST',
        body: form,
      }),
    );
  },

  getImportPreview: async (id: string): Promise<ImportPreview> =>
    dataOf(await requestJson<{ data: ImportPreview }>(`/import/${id}`)),

  commitImport: async (
    id: string,
    payload: {
      mapping: Record<string, string | null>;
      duplicateStrategy: 'add_copy' | 'skip';
      createMissingCollections: boolean;
    },
  ): Promise<ImportCommitResult> =>
    dataOf(
      await requestJson<{ data: ImportCommitResult }>(`/import/${id}/commit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    ),

  exportLibrary: async (
    params: Record<string, QueryValue | QueryValue[]>,
  ): Promise<{ blob: Blob; filename: string }> => {
    let response: Response;
    try {
      response = await fetch(`${BASE}/export${buildQuery(params)}`);
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the Bibliotheca server.');
    }
    if (!response.ok) {
      let body: ApiErrorBody = {};
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        // Ignore.
      }
      throw new ApiError(
        response.status,
        body.error?.code ?? 'EXPORT_FAILED',
        body.error?.message ?? 'The export could not be generated.',
      );
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return {
      blob: await response.blob(),
      filename: match?.[1] ?? 'bibliotheca-library',
    };
  },

  downloadBlob: (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
