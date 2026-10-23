import type { z } from 'zod';
import type { catalogQuerySchema } from '../../schemas/bookSchemas.js';
import type { CatalogFilters } from '../../types/models.js';

type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export function toCatalogFilters(query: CatalogQuery): CatalogFilters {
  return {
    q: query.q ?? undefined,
    collectionId: query.collectionId ?? undefined,
    format: query.format ?? undefined,
    condition: query.condition ?? undefined,
    status: query.status ?? undefined,
    language: query.language ?? undefined,
    publisher: query.publisher ?? undefined,
    yearFrom: query.yearFrom ?? undefined,
    yearTo: query.yearTo ?? undefined,
    missingCover: query.missingCover === true ? true : undefined,
    missingMetadata: query.missingMetadata === true ? true : undefined,
    addedFrom: query.addedFrom ?? undefined,
    addedTo: query.addedTo ?? undefined,
    sort: query.sort,
    order: query.order,
    page: query.page,
    pageSize: query.pageSize,
  };
}
