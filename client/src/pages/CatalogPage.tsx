import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  BookOpen,
  Check,
  Filter,
  Grid2X2,
  LayoutList,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CatalogEntry } from '../lib/types';
import {
  FORMAT_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  CONDITION_OPTIONS,
  cn,
  conditionLabel,
  errorMessage,
  formatLabel,
  pluralize,
  statusLabel,
} from '../lib/utils';
import { useCatalogFilters, useCollections } from '../lib/queries';
import { BookCard } from '../components/BookCard';
import { BookCover } from '../components/BookCover';
import { ExportDialog } from '../components/ExportDialog';
import { ImportDialog } from '../components/ImportDialog';
import { Alert, Button, EmptyState, Input, PageHeader, Select, Skeleton, buttonClasses } from '../components/ui';

function getParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null || value === '' ? undefined : value;
}

function getBoolParam(params: URLSearchParams, key: string): boolean | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function readFilters(params: URLSearchParams) {
  const sortParam = getParam(params, 'sort') ?? 'dateAdded';
  const sort = SORT_OPTIONS.some((option) => option.value === sortParam)
    ? sortParam
    : 'dateAdded';
  return {
    q: getParam(params, 'q'),
    collectionId: getParam(params, 'collectionId'),
    format: getParam(params, 'format'),
    status: getParam(params, 'status'),
    condition: getParam(params, 'condition'),
    language: getParam(params, 'language'),
    publisher: getParam(params, 'publisher'),
    yearFrom: getParam(params, 'yearFrom'),
    yearTo: getParam(params, 'yearTo'),
    missingCover: getBoolParam(params, 'missingCover'),
    missingMetadata: getBoolParam(params, 'missingMetadata'),
    sort,
    order: params.get('order') === 'asc' ? 'asc' : 'desc',
    page: parsePositiveInt(getParam(params, 'page'), 1, 100_000),
    pageSize: parsePositiveInt(getParam(params, 'pageSize'), 24, 100),
  };
}

function CatalogRow({ entry }: { entry: CatalogEntry }) {
  return (
    <Link
      to={`/books/${entry.book.id}`}
      className="group flex items-center gap-3.5 border-t border-line/60 py-2.5 transition hover:bg-forest-50/40 sm:px-2"
    >
      <BookCover
        url={entry.book.coverImageUrl}
        title={entry.book.title}
        authors={entry.book.authors}
        className="h-14 w-10 shrink-0 rounded"
        showSpine={false}
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 font-display text-sm font-semibold text-ink group-hover:text-forest-700">
          {entry.book.title}
        </p>
        <p className="line-clamp-1 text-xs text-muted">
          {entry.book.authors.join(' · ') || 'Unknown author'}
          {entry.book.publicationYear ? ` · ${entry.book.publicationYear}` : ''}
        </p>
      </div>
      <div className="hidden w-36 truncate text-xs text-muted md:block">
        {entry.collection?.name ?? 'Uncategorised'}
      </div>
      <div className="hidden w-24 text-xs text-muted lg:block">
        {entry.shelfLocation || '—'}
      </div>
      <div className="hidden w-28 text-right font-mono text-[0.65rem] text-muted/70 sm:block">
        {entry.itemCode}
      </div>
    </Link>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let index = start; index <= end; index += 1) pages.push(index);

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      {pages.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          onClick={() => onChange(pageNumber)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition',
            pageNumber === page
              ? 'bg-forest-700 text-parchment'
              : 'text-muted hover:bg-forest-50 hover:text-ink',
          )}
        >
          {pageNumber}
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const [searchInput, setSearchInput] = useState(filters.q ?? '');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (localStorage.getItem('bibliotheca-catalog-view') as 'grid' | 'list') || 'grid';
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('bibliotheca-catalog-view', view);
  }, [view]);

  useEffect(() => {
    setSearchInput(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if ((searchInput.trim() || '') === (filters.q ?? '')) return;
      const next = new URLSearchParams(searchParams);
      if (searchInput.trim()) next.set('q', searchInput.trim());
      else next.delete('q');
      next.set('page', '1');
      setSearchParams(next, { replace: true });
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [searchInput, filters.q, searchParams, setSearchParams]);

  const collections = useCollections();
  const catalogFilters = useCatalogFilters();

  const queryParams = useMemo(
    () => ({
      q: filters.q,
      collectionId: filters.collectionId,
      format: filters.format,
      status: filters.status,
      condition: filters.condition,
      language: filters.language,
      publisher: filters.publisher,
      yearFrom: filters.yearFrom ? Number(filters.yearFrom) : undefined,
      yearTo: filters.yearTo ? Number(filters.yearTo) : undefined,
      missingCover: filters.missingCover,
      missingMetadata: filters.missingMetadata,
      sort: filters.sort,
      order: filters.order,
      page: filters.page,
      pageSize: filters.pageSize,
    }),
    [filters],
  );

  const catalog = useQuery({
    queryKey: ['catalog', queryParams],
    queryFn: () => api.listCatalog(queryParams as Record<string, string | number | boolean | null>),
    placeholderData: keepPreviousData,
  });

  const updateParam = (key: string, value: string | number | boolean | undefined | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value === null || value === '' || value === false) {
      next.delete(key);
    } else if (value === true) {
      next.set(key, 'true');
    } else {
      next.set(key, String(value));
    }
    if (key !== 'page') next.set('page', '1');
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
    setSearchInput('');
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; value?: string }> = [];
    if (filters.q) chips.push({ key: 'q', label: `“${filters.q}”` });
    if (filters.collectionId) {
      if (filters.collectionId === 'uncategorized') {
        chips.push({ key: 'collectionId', label: 'Uncategorised' });
      } else {
        const collection = collections.data?.find((item) => item.id === filters.collectionId);
        chips.push({ key: 'collectionId', label: collection?.name ?? 'Collection' });
      }
    }
    if (filters.format) chips.push({ key: 'format', label: formatLabel(filters.format) });
    if (filters.status) chips.push({ key: 'status', label: statusLabel(filters.status) });
    if (filters.condition) chips.push({ key: 'condition', label: conditionLabel(filters.condition) });
    if (filters.language) chips.push({ key: 'language', label: filters.language });
    if (filters.publisher) chips.push({ key: 'publisher', label: filters.publisher });
    if (filters.yearFrom) chips.push({ key: 'yearFrom', label: `From ${filters.yearFrom}` });
    if (filters.yearTo) chips.push({ key: 'yearTo', label: `To ${filters.yearTo}` });
    if (filters.missingCover) chips.push({ key: 'missingCover', label: 'Missing cover' });
    if (filters.missingMetadata) chips.push({ key: 'missingMetadata', label: 'Incomplete metadata' });
    return chips;
  }, [filters, collections.data]);

  const removeChip = (key: string) => {
    if (key === 'q') {
      setSearchInput('');
      updateParam('q', undefined);
      return;
    }
    if (key === 'yearFrom') updateParam('yearFrom', undefined);
    else if (key === 'yearTo') updateParam('yearTo', undefined);
    else updateParam(key, undefined);
  };

  const data = catalog.data;
  const entries = data?.data ?? [];
  const pagination = data?.pagination;
  const filterValues = catalogFilters.data;

  const hasFilters = activeChips.length > 0;

  const filterPanel = (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Collection</p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => updateParam('collectionId', undefined)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition',
              !filters.collectionId ? 'bg-forest-50 text-forest-700' : 'text-ink hover:bg-forest-50/60',
            )}
          >
            All copies
            <span className="text-[0.65rem] text-muted">—</span>
          </button>
          <button
            type="button"
            onClick={() => updateParam('collectionId', 'uncategorized')}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition',
              filters.collectionId === 'uncategorized'
                ? 'bg-forest-50 text-forest-700'
                : 'text-ink hover:bg-forest-50/60',
            )}
          >
            Uncategorised
          </button>
          {collections.data?.map((collection) => (
            <button
              key={collection.id}
              type="button"
              onClick={() => updateParam('collectionId', collection.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition',
                filters.collectionId === collection.id
                  ? 'bg-forest-50 text-forest-700'
                  : 'text-ink hover:bg-forest-50/60',
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: collection.color }} />
              <span className="flex-1 truncate text-left">{collection.name}</span>
              <span className="text-[0.65rem] text-muted">{collection.itemCount}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Format</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => updateParam('format', undefined)}
            className={cn(
              'flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition',
              !filters.format ? 'bg-forest-700 text-parchment' : 'border border-line text-muted hover:text-ink',
            )}
          >
            Any
          </button>
          {FORMAT_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => updateParam('format', filters.format === value ? undefined : value)}
              className={cn(
                'flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition',
                filters.format === value
                  ? 'bg-forest-700 text-parchment'
                  : 'border border-line text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Status</p>
        <Select value={filters.status ?? ''} onChange={(event) => updateParam('status', event.target.value || undefined)}>
          <option value="">Any status</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Condition</p>
        <Select
          value={filters.condition ?? ''}
          onChange={(event) => updateParam('condition', event.target.value || undefined)}
        >
          <option value="">Any condition</option>
          {CONDITION_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {filterValues && filterValues.languages.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Language</p>
          <Select
            value={filters.language ?? ''}
            onChange={(event) => updateParam('language', event.target.value || undefined)}
          >
            <option value="">Any language</option>
            {filterValues.languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {filterValues && filterValues.publishers.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Publisher</p>
          <Select
            value={filters.publisher ?? ''}
            onChange={(event) => updateParam('publisher', event.target.value || undefined)}
          >
            <option value="">Any publisher</option>
            {filterValues.publishers.map((publisher) => (
              <option key={publisher} value={publisher}>
                {publisher}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {filterValues && filterValues.years.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Publication year</p>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={filters.yearFrom ?? ''}
              onChange={(event) => updateParam('yearFrom', event.target.value || undefined)}
            >
              <option value="">From</option>
              {[...filterValues.years].reverse().map((year) => (
                <option key={`from-${year}`} value={year}>
                  {year}
                </option>
              ))}
            </Select>
            <Select
              value={filters.yearTo ?? ''}
              onChange={(event) => updateParam('yearTo', event.target.value || undefined)}
            >
              <option value="">To</option>
              {[...filterValues.years].reverse().map((year) => (
                <option key={`to-${year}`} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Needs attention</p>
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={Boolean(filters.missingCover)}
              onChange={(event) => updateParam('missingCover', event.target.checked || undefined)}
              className="h-4 w-4 accent-forest-700"
            />
            Missing cover
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={Boolean(filters.missingMetadata)}
              onChange={(event) => updateParam('missingMetadata', event.target.checked || undefined)}
              className="h-4 w-4 accent-forest-700"
            />
            Incomplete metadata
          </label>
        </div>
      </div>

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full justify-center">
          Clear all filters
        </Button>
      ) : null}
    </div>
  );

  const exportFilters = useMemo(() => {
    const params: Record<string, string | number | boolean | null> = {};
    if (filters.q) params.q = filters.q;
    if (filters.collectionId) params.collectionId = filters.collectionId;
    if (filters.format) params.format = filters.format;
    if (filters.status) params.status = filters.status;
    if (filters.condition) params.condition = filters.condition;
    if (filters.language) params.language = filters.language;
    if (filters.publisher) params.publisher = filters.publisher;
    if (filters.yearFrom) params.yearFrom = Number(filters.yearFrom);
    if (filters.yearTo) params.yearTo = Number(filters.yearTo);
    if (filters.missingCover) params.missingCover = true;
    if (filters.missingMetadata) params.missingMetadata = true;
    if (filters.sort) params.sort = filters.sort;
    if (filters.order) params.order = filters.order;
    return params;
  }, [filters]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Your shelves"
        title="Catalog"
        description={
          pagination
            ? `${pluralize(pagination.total, 'item')} across your library`
            : 'Browse, filter and find every copy.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="secondary" onClick={() => setExportOpen(true)} disabled={!entries.length && !pagination?.total}>
              Export
            </Button>
            <Link to="/add" className={buttonClasses('primary', 'md')}>
              <Plus size={16} />
              Add a book
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search title, author, ISBN, tag, location or item code..."
            className="pl-9"
            aria-label="Search catalogue"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Select
            value={filters.sort}
            onChange={(event) => {
              const sort = event.target.value;
              const defaultOrder =
                sort === 'title' || sort === 'author' || sort === 'itemId' || sort === 'accessionNumber'
                  ? 'asc'
                  : 'desc';
              const next = new URLSearchParams(searchParams);
              next.set('sort', sort);
              next.set('order', defaultOrder);
              next.set('page', '1');
              setSearchParams(next);
            }}
            className="w-auto min-w-[10.5rem]"
            aria-label="Sort catalog"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            size="icon"
            title={filters.order === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending'}
            aria-label="Toggle sort direction"
            onClick={() => updateParam('order', filters.order === 'asc' ? 'desc' : 'asc')}
          >
            {filters.order === 'asc' ? <ArrowUpNarrowWide size={15} /> : <ArrowDownWideNarrow size={15} />}
          </Button>
        </div>
        <div className="flex rounded-lg border border-line bg-white/60 p-0.5">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn(
              'rounded-md p-1.5 transition',
              view === 'grid' ? 'bg-forest-700 text-parchment' : 'text-muted hover:text-ink',
            )}
            aria-label="Grid view"
          >
            <Grid2X2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'rounded-md p-1.5 transition',
              view === 'list' ? 'bg-forest-700 text-parchment' : 'text-muted hover:text-ink',
            )}
            aria-label="List view"
          >
            <LayoutList size={16} />
          </button>
        </div>
        <Button variant="secondary" onClick={() => setFilterOpen(true)} className="lg:hidden">
          <SlidersHorizontal size={15} />
          Filters
          {hasFilters ? (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-forest-700 text-[0.6rem] text-parchment">
              {activeChips.length}
            </span>
          ) : null}
        </Button>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <button
              key={`${chip.key}-${chip.label}`}
              type="button"
              onClick={() => removeChip(chip.key)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/60 px-2.5 py-1 text-xs text-ink transition hover:border-forest-200"
            >
              {chip.label}
              <X size={12} className="text-muted" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-forest-700 hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 card p-4">
            <div className="mb-4 flex items-center gap-2">
              <Filter size={15} className="text-gold-600" />
              <p className="text-sm font-semibold text-ink">Filters</p>
            </div>
            {filterPanel}
          </div>
        </aside>

        <section>
          {catalog.isLoading && !catalog.data ? (
            view === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <Skeleton key={index} className="h-[19rem]" />
                ))}
              </div>
            ) : (
              <div className="card px-4 py-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="my-2 h-16" />
                ))}
              </div>
            )
          ) : catalog.isError ? (
            <Alert tone="danger" title="The catalog could not be loaded">
              <div className="flex flex-wrap items-center gap-3">
                <span>{errorMessage(catalog.error)}</span>
                <Button size="sm" variant="secondary" onClick={() => void catalog.refetch()}>
                  Try again
                </Button>
              </div>
            </Alert>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={18} />}
              title={hasFilters ? 'No matches for these filters' : 'Your catalogue is quiet'}
              description={
                hasFilters
                  ? 'Try loosening a filter or searching for something broader.'
                  : 'Start by adding a book, importing a file or finding an edition.'
              }
              action={
                <div className="flex flex-wrap gap-2">
                  {hasFilters ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <>
                      <Link to="/add" className={buttonClasses('primary', 'md')}>
                        Add a book
                      </Link>
                      <Button variant="secondary" onClick={() => setImportOpen(true)}>
                        Import
                      </Button>
                    </>
                  )}
                </div>
              }
              className="py-16"
            />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {entries.map((entry) => (
                <BookCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-3.5 border-b border-line/70 px-4 py-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted">
                <div className="w-10" />
                <div className="flex-1">Book</div>
                <div className="hidden w-36 md:block">Collection</div>
                <div className="hidden w-24 lg:block">Shelf</div>
                <div className="hidden w-28 text-right sm:block">Item code</div>
              </div>
              <div className="divide-y divide-line/50 px-2">
                {entries.map((entry) => (
                  <CatalogRow key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          )}

          {pagination && pagination.totalPages > 1 ? (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onChange={(page) => updateParam('page', page)}
            />
          ) : null}
        </section>
      </div>

      {filterOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-forest-950/50 backdrop-blur-[2px]"
            onClick={() => setFilterOpen(false)}
          />
          <div className="relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-ivory shadow-lift animate-fade-up">
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={15} className="text-gold-600" />
                <p className="font-medium text-ink">Filters</p>
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="rounded-lg p-1.5 text-muted"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{filterPanel}</div>
            <div className="flex gap-2 border-t border-line/70 px-5 py-3">
              {hasFilters ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    clearFilters();
                    setFilterOpen(false);
                  }}
                  className="flex-1"
                >
                  Clear
                </Button>
              ) : null}
              <Button onClick={() => setFilterOpen(false)} className="flex-1">
                <Check size={16} />
                Show results
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} filters={exportFilters} filterLabel="Current catalog filters" />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
