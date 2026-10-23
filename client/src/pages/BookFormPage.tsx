import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  ImagePlus,
  Loader2,
  Save,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { ApiError, api, type BookConflictDetails } from '../lib/api';
import type {
  Book,
  BookPayload,
  DuplicateCandidate,
  ItemFormat,
  ItemPayload,
  ItemStatus,
  MetadataCandidate,
  PhysicalCondition,
} from '../lib/types';
import {
  CONDITION_OPTIONS,
  FORMAT_OPTIONS,
  STATUS_OPTIONS,
  cn,
  emptyToNull,
  errorMessage,
  formatLabel,
  splitList,
  splitTags,
  toOptionalNumber,
} from '../lib/utils';
import { useBook, useCollections, useSettings } from '../lib/queries';
import { useToast } from '../components/Toast';
import { BookCover } from '../components/BookCover';
import { LookupPanel } from '../components/LookupPanel';
import {
  Alert,
  Button,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  buttonClasses,
} from '../components/ui';

interface BookFormValues {
  title: string;
  subtitle: string;
  authors: string;
  isbn10: string;
  isbn13: string;
  publisher: string;
  publicationDate: string;
  publicationYear: string;
  edition: string;
  language: string;
  pageCount: string;
  seriesTitle: string;
  seriesVolume: string;
  subjects: string;
  description: string;
  tableOfContents: string;
  coverImageUrl: string;
  coverImageSource: string;
  format: ItemFormat;
  itemStatus: ItemStatus;
  physicalCondition: PhysicalCondition | '';
  collectionId: string;
  shelfLocation: string;
  accessionNumber: string;
  acquisitionDate: string;
  acquisitionSource: string;
  purchasePrice: string;
  currency: string;
  tags: string;
  notes: string;
}

interface SourceMeta {
  metadataSource: string | null;
  externalReference: string | null;
  externalUrl: string | null;
  originalPublicationDate: string | null;
  metadataRetrievedAt: string | null;
  fieldSources: Record<string, string> | null;
}

const EMPTY_SOURCE: SourceMeta = {
  metadataSource: null,
  externalReference: null,
  externalUrl: null,
  originalPublicationDate: null,
  metadataRetrievedAt: null,
  fieldSources: null,
};

const EMPTY_FORM: BookFormValues = {
  title: '',
  subtitle: '',
  authors: '',
  isbn10: '',
  isbn13: '',
  publisher: '',
  publicationDate: '',
  publicationYear: '',
  edition: '',
  language: '',
  pageCount: '',
  seriesTitle: '',
  seriesVolume: '',
  subjects: '',
  description: '',
  tableOfContents: '',
  coverImageUrl: '',
  coverImageSource: '',
  format: 'physical',
  itemStatus: 'owned',
  physicalCondition: 'good',
  collectionId: '',
  shelfLocation: '',
  accessionNumber: '',
  acquisitionDate: '',
  acquisitionSource: '',
  purchasePrice: '',
  currency: 'USD',
  tags: '',
  notes: '',
};

function bookToValues(book: Book): BookFormValues {
  return {
    ...EMPTY_FORM,
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors.join('; '),
    isbn10: book.isbn10 ?? '',
    isbn13: book.isbn13 ?? '',
    publisher: book.publisher ?? '',
    publicationDate: book.publicationDate ?? '',
    publicationYear: book.publicationYear !== null ? String(book.publicationYear) : '',
    edition: book.edition ?? '',
    language: book.language ?? '',
    pageCount: book.pageCount !== null ? String(book.pageCount) : '',
    seriesTitle: book.seriesTitle ?? '',
    seriesVolume: book.seriesVolume ?? '',
    subjects: book.subjects.join('; '),
    description: book.description ?? '',
    tableOfContents: book.tableOfContents ?? '',
    coverImageUrl: book.coverImageUrl ?? '',
    coverImageSource: book.coverImageSource ?? '',
  };
}

function useDebounced<T>(value: T, delay = 450): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const MATCH_REASONS: Record<DuplicateCandidate['matchReason'], string> = {
  isbn: 'Same ISBN',
  title_author: 'Similar title and author',
  title: 'Similar title',
};

export function BookFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useSettings();
  const collections = useCollections();
  const bookQuery = useBook(id);

  const [sourceMeta, setSourceMeta] = useState<SourceMeta>(EMPTY_SOURCE);
  const [serverError, setServerError] = useState('');
  const [conflict, setConflict] = useState<{ message: string; details: BookConflictDetails } | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const loadedBook = useRef<string | null>(null);
  const defaultsApplied = useRef(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BookFormValues>({ defaultValues: EMPTY_FORM });

  useEffect(() => {
    if (bookQuery.data && loadedBook.current !== bookQuery.data.id) {
      loadedBook.current = bookQuery.data.id;
      reset(bookToValues(bookQuery.data));
      setSourceMeta({
        metadataSource: bookQuery.data.metadataSource,
        externalReference: bookQuery.data.externalReference,
        externalUrl: bookQuery.data.externalUrl,
        originalPublicationDate: bookQuery.data.originalPublicationDate,
        metadataRetrievedAt: bookQuery.data.metadataRetrievedAt,
        fieldSources: bookQuery.data.fieldSources,
      });
    }
  }, [bookQuery.data, reset]);

  useEffect(() => {
    if (isEdit || defaultsApplied.current || !settings.data) return;
    defaultsApplied.current = true;
    setValue(
      'format',
      settings.data.values.default_format === 'digital' ? 'digital' : 'physical',
    );
    const condition = settings.data.values.default_condition as PhysicalCondition | undefined;
    if (condition) setValue('physicalCondition', condition);
    if (settings.data.values.default_currency) {
      setValue('currency', settings.data.values.default_currency);
    }
  }, [isEdit, settings.data, setValue]);

  const title = watch('title');
  const authors = watch('authors');
  const publisher = watch('publisher');
  const publicationYear = watch('publicationYear');
  const coverUrl = watch('coverImageUrl');
  const format = watch('format');

  const isbnForDuplicates = watch('isbn13') || watch('isbn10');
  const debouncedTitle = useDebounced(title);
  const debouncedIsbn = useDebounced(isbnForDuplicates);
  const firstAuthor = splitList(authors)[0] ?? '';

  const duplicateQuery = useQuery({
    queryKey: ['duplicates', debouncedIsbn, debouncedTitle, firstAuthor, isEdit],
    queryFn: () =>
      api.getDuplicates({
        isbn: debouncedIsbn || undefined,
        title: debouncedTitle || undefined,
        author: firstAuthor || undefined,
      }),
    enabled: !isEdit && (debouncedIsbn.trim().length >= 10 || debouncedTitle.trim().length >= 2),
    staleTime: 30_000,
  });

  const duplicates = conflict?.details?.duplicates ?? duplicateQuery.data ?? [];
  const existingBook = conflict?.details?.existingBook ?? null;
  const hasIsbnDuplicate = Boolean(
    existingBook || duplicates.some((candidate) => candidate.matchReason === 'isbn'),
  );

  const applyCandidate = (candidate: MetadataCandidate) => {
    const values: Array<[keyof BookFormValues, string]> = [
      ['title', candidate.title],
      ['subtitle', candidate.subtitle ?? ''],
      ['authors', candidate.authors.join('; ')],
      ['isbn10', candidate.isbn10 ?? ''],
      ['isbn13', candidate.isbn13 ?? ''],
      ['publisher', candidate.publisher ?? ''],
      ['publicationDate', candidate.publicationDate ?? ''],
      ['publicationYear', candidate.publicationYear ? String(candidate.publicationYear) : ''],
      ['edition', candidate.edition ?? ''],
      ['language', candidate.language ?? ''],
      ['pageCount', candidate.pageCount !== null ? String(candidate.pageCount) : ''],
      ['seriesTitle', candidate.seriesTitle ?? ''],
      ['seriesVolume', candidate.seriesVolume ?? ''],
      ['subjects', candidate.subjects.join('; ')],
      ['description', candidate.description ?? ''],
      ['tableOfContents', candidate.tableOfContents ?? ''],
      ['coverImageUrl', candidate.coverImageUrl ?? ''],
      ['coverImageSource', candidate.coverImageSource ?? ''],
    ];
    for (const [field, value] of values) {
      setValue(field, value, { shouldDirty: true });
    }
    setSourceMeta({
      metadataSource: candidate.primaryProvider,
      externalReference: candidate.primaryProviderId,
      externalUrl: candidate.externalUrl,
      originalPublicationDate: candidate.originalPublicationDate,
      metadataRetrievedAt: new Date().toISOString(),
      fieldSources: null,
    });
    setConflict(null);
    setServerError('');
  };

  const handleCoverUpload = async (file: File) => {
    setUploadingCover(true);
    try {
      const uploaded = await api.uploadCover(file);
      setValue('coverImageUrl', uploaded.url, { shouldDirty: true });
      setValue('coverImageSource', uploaded.source, { shouldDirty: true });
      toast.success('Cover image uploaded.');
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setUploadingCover(false);
    }
  };

  const onSubmit = async (values: BookFormValues) => {
    setServerError('');
    setConflict(null);
    setSaving(true);

    const book: BookPayload = {
      title: values.title.trim(),
      subtitle: emptyToNull(values.subtitle),
      authors: splitList(values.authors),
      isbn10: emptyToNull(values.isbn10),
      isbn13: emptyToNull(values.isbn13),
      publisher: emptyToNull(values.publisher),
      publicationDate: emptyToNull(values.publicationDate),
      publicationYear: toOptionalNumber(values.publicationYear),
      edition: emptyToNull(values.edition),
      language: emptyToNull(values.language),
      pageCount: toOptionalNumber(values.pageCount),
      seriesTitle: emptyToNull(values.seriesTitle),
      seriesVolume: emptyToNull(values.seriesVolume),
      subjects: splitList(values.subjects),
      description: emptyToNull(values.description),
      tableOfContents: emptyToNull(values.tableOfContents),
      coverImageUrl: emptyToNull(values.coverImageUrl),
      coverImageSource: emptyToNull(values.coverImageSource),
      ...sourceMeta,
    };

    try {
      if (isEdit && id) {
        await api.updateBook(id, book);
        await queryClient.invalidateQueries();
        toast.success('The edition record was updated.');
        navigate(`/books/${id}`);
        return;
      }

      const item: ItemPayload = {
        format: values.format,
        itemStatus: values.itemStatus,
        physicalCondition:
          values.format === 'digital'
            ? null
            : ((values.physicalCondition || null) as PhysicalCondition | null),
        collectionId: emptyToNull(values.collectionId),
        shelfLocation: emptyToNull(values.shelfLocation),
        accessionNumber: emptyToNull(values.accessionNumber),
        acquisitionDate: emptyToNull(values.acquisitionDate),
        acquisitionSource: emptyToNull(values.acquisitionSource),
        purchasePrice: toOptionalNumber(values.purchasePrice),
        currency: emptyToNull(values.currency)?.toUpperCase() ?? null,
        tags: splitTags(values.tags),
        notes: emptyToNull(values.notes),
      };

      const response = await api.createBook({
        book,
        item,
        duplicateAcknowledged: acknowledged,
      });
      await queryClient.invalidateQueries();
      toast.success('The book is now in your library.');
      for (const warning of response.warnings ?? []) toast.info(warning);
      navigate(`/books/${response.data.book.id}`);
    } catch (cause) {
      const message = errorMessage(cause);
      setServerError(message);
      if (cause instanceof ApiError && cause.status === 409) {
        const details = (cause.details ?? {}) as BookConflictDetails;
        setConflict({ message, details });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && bookQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
          <div className="space-y-4">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (isEdit && bookQuery.isError) {
    return (
      <div className="card p-10 text-center">
        <TriangleAlert className="mx-auto text-danger" />
        <h1 className="mt-3 font-display text-2xl font-semibold">Could not open this record</h1>
        <p className="mt-1 text-sm text-muted">{errorMessage(bookQuery.error)}</p>
        <Link to="/catalog" className={buttonClasses('secondary', 'md', 'mt-5')}>
          Back to catalog
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <PageHeader
        eyebrow={isEdit ? 'Edit edition record' : 'New catalogue entry'}
        title={isEdit ? 'Refine the bibliographic record' : 'Catalogue a book'}
        description={
          isEdit
            ? 'Update the shared edition details. Copy-specific information is managed on the book page.'
            : 'Identify the edition, check the details, and add your first copy to the shelves.'
        }
        actions={
          <>
            <Link
              to={isEdit && id ? `/books/${id}` : '/catalog'}
              className={buttonClasses('ghost', 'md')}
            >
              <ArrowLeft size={16} />
              Cancel
            </Link>
            <Button type="submit" loading={saving}>
              <Save size={16} />
              {isEdit ? 'Save changes' : 'Add to library'}
            </Button>
          </>
        }
      />

      {serverError ? (
        <Alert tone="danger" title="The record could not be saved">
          {serverError}
        </Alert>
      ) : null}

      {!isEdit ? <LookupPanel onSelect={applyCandidate} /> : null}

      {duplicates.length > 0 || existingBook ? (
        <section className="rounded-2xl border border-gold-300/70 bg-gold-50/60 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-200/70 text-gold-800">
              <TriangleAlert size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold text-gold-900">
                This may already be on your shelves
              </h3>
              <p className="mt-0.5 text-sm text-gold-800/80">
                {existingBook
                  ? 'That ISBN belongs to an existing record. Add another copy to that book instead of creating a duplicate edition.'
                  : 'We found similar records. Check that this is a genuinely different edition.'}
              </p>

              <div className="mt-3 space-y-2">
                {existingBook ? (
                  <Link
                    to={`/books/${existingBook.id}`}
                    className="flex items-center gap-3 rounded-xl border border-gold-200 bg-white/70 p-2.5 transition hover:bg-white"
                  >
                    <BookCover
                      url={existingBook.coverImageUrl}
                      title={existingBook.title}
                      authors={existingBook.authors}
                      className="h-14 w-10 shrink-0 rounded"
                      showSpine={false}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{existingBook.title}</p>
                      <p className="text-xs text-muted">
                        {existingBook.authors.join(' · ') || 'Unknown author'} ·{' '}
                        {existingBook.itemCount}{' '}
                        {existingBook.itemCount === 1 ? 'copy' : 'copies'}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-forest-700">
                      Open <ExternalLink size={12} />
                    </span>
                  </Link>
                ) : null}

                {duplicates
                  .filter((candidate) => candidate.book.id !== existingBook?.id)
                  .slice(0, 4)
                  .map((candidate) => (
                    <Link
                      key={candidate.book.id}
                      to={`/books/${candidate.book.id}`}
                      className="flex items-center gap-3 rounded-xl border border-gold-200/80 bg-white/60 p-2.5 transition hover:bg-white"
                    >
                      <BookCover
                        url={candidate.book.coverImageUrl}
                        title={candidate.book.title}
                        authors={candidate.book.authors}
                        className="h-12 w-9 shrink-0 rounded"
                        showSpine={false}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{candidate.book.title}</p>
                        <p className="truncate text-xs text-muted">
                          {candidate.book.authors.join(' · ') || 'Unknown author'} ·{' '}
                          {candidate.itemCount} {candidate.itemCount === 1 ? 'copy' : 'copies'} ·{' '}
                          {MATCH_REASONS[candidate.matchReason]}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-forest-700">
                        Open <ExternalLink size={12} />
                      </span>
                    </Link>
                  ))}
              </div>

              {!hasIsbnDuplicate ? (
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-gold-200 bg-white/50 px-3 py-2.5 text-xs text-gold-900">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-forest-700"
                  />
                  <span>
                    This is a different edition, not a duplicate. Save it as a separate
                    bibliographic record.
                  </span>
                </label>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-5">
          <section className="card p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <BookOpen size={18} className="text-gold-600" />
              <h2 className="font-display text-xl font-semibold text-ink">The book</h2>
            </div>
            <div className="space-y-4">
              <Field label="Title" htmlFor="book-title" required error={errors.title?.message}>
                <Input
                  id="book-title"
                  {...register('title', { required: 'A title is required.' })}
                  placeholder="The title as printed on the edition"
                  autoFocus={!isEdit}
                />
              </Field>

              <Field label="Subtitle" htmlFor="book-subtitle">
                <Input id="book-subtitle" {...register('subtitle')} placeholder="Optional subtitle" />
              </Field>

              <Field
                label="Authors"
                htmlFor="book-authors"
                hint="Separate multiple authors with semicolons."
              >
                <Input
                  id="book-authors"
                  {...register('authors')}
                  placeholder="Ursula K. Le Guin; David Mitchell"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ISBN-10" htmlFor="book-isbn10">
                  <Input id="book-isbn10" {...register('isbn10')} placeholder="0-000-00000-0" />
                </Field>
                <Field label="ISBN-13" htmlFor="book-isbn13">
                  <Input id="book-isbn13" {...register('isbn13')} placeholder="978-0-000-00000-0" />
                </Field>
              </div>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 font-display text-xl font-semibold text-ink">Publication</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Publisher" htmlFor="book-publisher">
                <Input id="book-publisher" {...register('publisher')} placeholder="Publisher name" />
              </Field>
              <Field label="Edition" htmlFor="book-edition">
                <Input id="book-edition" {...register('edition')} placeholder="First, revised, 2nd…" />
              </Field>
              <Field label="Publication date" htmlFor="book-pubdate">
                <Input
                  id="book-pubdate"
                  {...register('publicationDate')}
                  placeholder="1974-04-01 or 1974"
                />
              </Field>
              <Field label="Publication year" htmlFor="book-year" hint="Filled automatically from the date.">
                <Input
                  id="book-year"
                  type="number"
                  min="1000"
                  max="2200"
                  {...register('publicationYear')}
                  placeholder="1974"
                />
              </Field>
              <Field label="Language" htmlFor="book-language">
                <Input id="book-language" {...register('language')} placeholder="English" />
              </Field>
              <Field label="Page count" htmlFor="book-pages">
                <Input
                  id="book-pages"
                  type="number"
                  min="0"
                  {...register('pageCount')}
                  placeholder="320"
                />
              </Field>
              <Field label="Series" htmlFor="book-series">
                <Input id="book-series" {...register('seriesTitle')} placeholder="Series name" />
              </Field>
              <Field label="Series volume" htmlFor="book-volume">
                <Input id="book-volume" {...register('seriesVolume')} placeholder="1" />
              </Field>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 font-display text-xl font-semibold text-ink">Description & subjects</h2>
            <div className="space-y-4">
              <Field label="Subjects" htmlFor="book-subjects" hint="Separate subjects with semicolons.">
                <Input
                  id="book-subjects"
                  {...register('subjects')}
                  placeholder="Science fiction; Anthropology; Classics"
                />
              </Field>
              <Field label="Description" htmlFor="book-description">
                <Textarea
                  id="book-description"
                  {...register('description')}
                  placeholder="A synopsis or notes about this edition…"
                  className="min-h-32"
                />
              </Field>
              <details className="group rounded-xl border border-line bg-white/30 px-4 py-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.08em] text-muted marker:text-gold-500">
                  Table of contents
                </summary>
                <Textarea
                  {...register('tableOfContents')}
                  placeholder="Optional table of contents"
                  className="mt-3 min-h-24"
                />
              </details>
            </div>
          </section>

          {!isEdit ? (
            <section className="card p-5 sm:p-6">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl font-semibold text-ink">Your copy</h2>
                <div className="flex rounded-lg border border-line bg-white/60 p-0.5">
                  {FORMAT_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setValue('format', value, { shouldDirty: true })}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition',
                        format === value
                          ? 'bg-forest-700 text-parchment shadow-sm'
                          : 'text-muted hover:text-ink',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-4 text-sm text-muted">
                Describe the physical or digital copy joining your shelves.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Status" htmlFor="form-status">
                  <Select id="form-status" {...register('itemStatus')}>
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Condition" htmlFor="form-condition">
                  <Select
                    id="form-condition"
                    {...register('physicalCondition')}
                    disabled={format === 'digital'}
                  >
                    <option value="">Not recorded</option>
                    {CONDITION_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Collection" htmlFor="form-collection">
                  <Select id="form-collection" {...register('collectionId')}>
                    <option value="">No collection</option>
                    {collections.data?.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Shelf location" htmlFor="form-shelf">
                  <Input id="form-shelf" {...register('shelfLocation')} placeholder="e.g. Study · B2" />
                </Field>
                <Field label="Accession number" htmlFor="form-accession">
                  <Input id="form-accession" {...register('accessionNumber')} placeholder="Optional" />
                </Field>
                <Field label="Acquired on" htmlFor="form-acquired">
                  <Input id="form-acquired" type="date" {...register('acquisitionDate')} />
                </Field>
                <Field label="Acquisition source" htmlFor="form-source">
                  <Input
                    id="form-source"
                    {...register('acquisitionSource')}
                    placeholder="Bookshop, gift…"
                  />
                </Field>
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <Field label="Price" htmlFor="form-price">
                    <Input
                      id="form-price"
                      type="number"
                      min="0"
                      step="0.01"
                      {...register('purchasePrice')}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Currency" htmlFor="form-currency">
                    <Input
                      id="form-currency"
                      maxLength={3}
                      {...register('currency')}
                      className="uppercase"
                    />
                  </Field>
                </div>
                <Field label="Tags" htmlFor="form-tags" hint="Comma separated.">
                  <Input id="form-tags" {...register('tags')} placeholder="signed, to read" />
                </Field>
              </div>

              <Field label="Notes on this copy" htmlFor="form-notes" className="mt-4">
                <Textarea
                  id="form-notes"
                  {...register('notes')}
                  placeholder="Inscriptions, condition notes, where it came from…"
                  className="min-h-20"
                />
              </Field>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Cover
            </p>
            <BookCover
              url={coverUrl || null}
              title={title || 'Untitled'}
              authors={splitList(authors)}
              className="mx-auto aspect-[2/3] w-40"
            />
            <input type="hidden" {...register('coverImageSource')} />
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                loading={uploadingCover}
                onClick={() => coverInput.current?.click()}
              >
                <Upload size={13} />
                Upload
              </Button>
              {coverUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setValue('coverImageUrl', '', { shouldDirty: true });
                    setValue('coverImageSource', '', { shouldDirty: true });
                  }}
                  aria-label="Remove cover"
                >
                  <Trash2 size={14} />
                </Button>
              ) : null}
            </div>
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleCoverUpload(file);
                event.target.value = '';
              }}
            />
            <div className="mt-3">
              <Field label="Or image URL" htmlFor="cover-url">
                <Input
                  id="cover-url"
                  {...register('coverImageUrl')}
                  placeholder="https://…"
                  className="text-xs"
                />
              </Field>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[0.65rem] leading-relaxed text-muted">
              <ImagePlus size={12} />
              JPG, PNG, WebP or GIF. Uploads are stored locally.
            </p>
          </section>

          <section className="rounded-2xl border border-forest-800/20 bg-gradient-to-b from-forest-900 to-forest-950 p-5 text-parchment shadow-lift">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-gold-300/80">
              {isEdit ? 'Edition record' : 'Ready for the shelf?'}
            </p>
            <h2 className="mt-1.5 line-clamp-2 font-display text-xl font-semibold leading-snug">
              {title || 'Untitled book'}
            </h2>
            <p className="mt-1 line-clamp-2 text-xs text-parchment/60">
              {splitList(authors).join(' · ') || 'Author not set'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[0.62rem] text-parchment/60">
              {publisher ? (
                <span className="rounded-full border border-parchment/15 px-2 py-0.5">{publisher}</span>
              ) : null}
              {publicationYear ? (
                <span className="rounded-full border border-parchment/15 px-2 py-0.5">
                  {publicationYear}
                </span>
              ) : null}
              <span className="rounded-full border border-parchment/15 px-2 py-0.5">
                {formatLabel(format)}
              </span>
            </div>
            <Button type="submit" variant="gold" className="mt-4 w-full" loading={saving}>
              <Save size={15} />
              {isEdit ? 'Save changes' : 'Add to library'}
            </Button>
            <p className="mt-2.5 text-center text-[0.62rem] text-parchment/35">
              {isEdit ? 'Copy details stay untouched.' : 'You can change everything later.'}
            </p>
          </section>

          {isEdit && sourceMeta.metadataSource ? (
            <div className="rounded-xl border border-line bg-white/40 p-3.5 text-[0.68rem] leading-relaxed text-muted">
              <p className="font-medium text-ink">Metadata provenance</p>
              <p className="mt-0.5">
                Originally retrieved from{' '}
                {sourceMeta.metadataSource === 'google_books'
                  ? 'Google Books'
                  : sourceMeta.metadataSource === 'open_library'
                    ? 'Open Library'
                    : sourceMeta.metadataSource}
                .
              </p>
              {sourceMeta.externalUrl ? (
                <a
                  href={sourceMeta.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 font-medium text-forest-700 hover:underline"
                >
                  View source <ExternalLink size={10} />
                </a>
              ) : null}
            </div>
          ) : null}

          {saving ? (
            <p className="flex items-center justify-center gap-2 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Saving the record…
            </p>
          ) : null}
        </aside>
      </div>
    </form>
  );
}
