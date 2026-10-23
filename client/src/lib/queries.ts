import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const qk = {
  stats: ['stats'] as const,
  filters: ['catalog', 'filters'] as const,
  collections: ['collections'] as const,
  settings: ['settings'] as const,
  catalog: (params: Record<string, unknown>) => ['catalog', params] as const,
  book: (id: string) => ['book', id] as const,
};

export function useStats() {
  return useQuery({ queryKey: qk.stats, queryFn: api.getStats });
}

export function useCatalogFilters() {
  return useQuery({ queryKey: qk.filters, queryFn: api.getCatalogFilters, staleTime: 60_000 });
}

export function useCollections() {
  return useQuery({ queryKey: qk.collections, queryFn: api.getCollections });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.getSettings, staleTime: 60_000 });
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: qk.book(id ?? ''),
    queryFn: () => api.getBook(id ?? ''),
    enabled: Boolean(id),
  });
}
