import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CopyPlus,
  Edit3,
  ExternalLink,
  FileText,
  Hash,
  Layers,
  MapPin,
  MonitorSmartphone,
  Plus,
  Trash2,
} from 'lucide-react';
import { ApiError, api } from '../lib/api';
import type { CatalogEntry } from '../lib/types';
import {
  cn,
  conditionLabel,
  errorMessage,
  formatDate,
  formatLabel,
  pluralize,
  statusLabel,
  statusStyle,
} from '../lib/utils';
import { useBook } from '../lib/queries';
import { useToast } from '../components/Toast';
import { BookCover } from '../components/BookCover';
import { ConfirmDialog } from '../components/ui';
import { ItemDialog } from '../components/ItemDialog';
import { Badge, Button, EmptyState, Skeleton, buttonClasses } from '../components/ui';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line/60 py-2.5 first:border-t-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink">{value}</dd>
    </div>
  );
}

function CopyCard({ item, onEdit }: { item: CatalogEntry; onEdit: (item: CatalogEntry) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const copy = await api.duplicateCatalogItem(item.id);
      await queryClient.invalidateQueries();
      toast.success('Another copy was added.');
      navigate(`/books/${copy.bookId}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteCatalogItem(item.id);
      await queryClient.invalidateQueries();
      toast.success('The copy was removed.');
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
      else toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
      setConfirm(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white/40 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink">{item.itemCode}</span>
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem]', statusStyle(item.itemStatus))}>
            {statusLabel(item.itemStatus)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[0.62rem] text-muted">
            {item.format === 'digital' ? <MonitorSmartphone size={11} /> : <BookOpen size={11} />}
            {formatLabel(item.format)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onEdit(item)}>
            <Edit3 size={13} />
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDuplicate} loading={duplicating}>
            <CopyPlus size={13} />
            Add copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:bg-red-50"
            onClick={() => setConfirm(true)}
          >
            <Trash2 size={13} />
            Remove
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted">
        {item.collection ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.collection.color }} />
            {item.collection.name}
          </span>
        ) : null}
        {item.shelfLocation ? (
          <span className="inline-flex items-center gap-1">
            <MapPin size={11} />
            {item.shelfLocation}
          </span>
        ) : null}
        {item.physicalCondition ? (
          <span>Condition: {conditionLabel(item.physicalCondition)}</span>
        ) : null}
        {item.accessionNumber ? (
          <span>Accession: {item.accessionNumber}</span>
        ) : null}
        {item.acquisitionDate ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={11} />
            Acquired {formatDate(item.acquisitionDate)}
          </span>
        ) : null}
        {item.purchasePrice !== null ? (
          <span>
            {item.currency ? `${item.currency} ` : ''}
            {item.purchasePrice.toFixed(2)}
          </span>
        ) : null}
      </div>

      {item.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-line bg-parchment px-2 py-0.5 text-[0.62rem] text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {item.notes ? (
        <p className="mt-2 rounded-lg bg-forest-50/40 px-2.5 py-2 text-xs leading-relaxed text-ink/80">
          {item.notes}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Remove this copy?"
        description="This will delete the catalogue item. The bibliographic record stays if other copies remain."
        confirmLabel="Remove copy"
      />
    </div>
  );
}

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const book = useBook(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogEntry | null>(null);
  const [deleteBookOpen, setDeleteBookOpen] = useState(false);
  const [deletingBook, setDeletingBook] = useState(false);

  const data = book.data;

  const handleDeleteBook = async () => {
    if (!id) return;
    setDeletingBook(true);
    try {
      await api.deleteBook(id);
      await queryClient.invalidateQueries();
      toast.success('The edition record was deleted.');
      navigate('/catalog');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingBook(false);
      setDeleteBookOpen(false);
    }
  };

  if (book.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-40" />
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Skeleton className="h-[24rem]" />
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-48" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (book.isError || !data) {
    return (
      <div className="card p-10 text-center">
        <BookOpen className="mx-auto text-muted" />
        <h1 className="mt-3 font-display text-2xl font-semibold">Book not found</h1>
        <p className="mt-1 text-sm text-muted">This record may have been removed.</p>
        <Link to="/catalog" className={buttonClasses('secondary', 'md', 'mt-5')}>
          Back to catalog
        </Link>
      </div>
    );
  }

  const canDelete = data.itemCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to catalog
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link to={`/books/${data.id}/edit`} className={buttonClasses('secondary', 'sm')}>
            <Edit3 size={13} />
            Edit record
          </Link>
          <Button size="sm" onClick={() => setItemDialogOpen(true)}>
            <Plus size={13} />
            Add copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={() => setDeleteBookOpen(true)}
            disabled={!canDelete}
            title={canDelete ? undefined : 'Delete all copies before removing this record'}
          >
            <Trash2 size={13} />
            Delete record
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="card overflow-hidden p-4">
            <BookCover
              url={data.coverImageUrl}
              title={data.title}
              authors={data.authors}
              className="mx-auto aspect-[2/3] w-full max-w-[12rem]"
            />
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {data.authors.slice(0, 2).map((author) => (
                <Badge key={author} tone="neutral">
                  {author}
                </Badge>
              ))}
              {data.metadataSource ? (
                <Badge tone="forest">
                  {data.metadataSource === 'google_books'
                    ? 'Google Books'
                    : data.metadataSource === 'open_library'
                      ? 'Open Library'
                      : data.metadataSource}
                </Badge>
              ) : null}
            </div>
          </div>

          <section className="card p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Details
            </p>
            <dl>
              <DetailRow label="Subtitle" value={data.subtitle} />
              <DetailRow label="Publisher" value={data.publisher} />
              <DetailRow label="Published" value={data.publicationDate || data.publicationYear} />
              <DetailRow label="Edition" value={data.edition} />
              <DetailRow label="Language" value={data.language} />
              <DetailRow label="Pages" value={data.pageCount} />
              <DetailRow
                label="Series"
                value={data.seriesTitle ? `${data.seriesTitle}${data.seriesVolume ? ` · Vol. ${data.seriesVolume}` : ''}` : null}
              />
              <DetailRow label="Original publication" value={data.originalPublicationDate} />
            </dl>
            {data.isbn13 || data.isbn10 ? (
              <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
                {data.isbn13 ? (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted">ISBN-13</span>
                    <span className="font-mono text-ink">{data.isbn13}</span>
                  </div>
                ) : null}
                {data.isbn10 ? (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted">ISBN-10</span>
                    <span className="font-mono text-ink">{data.isbn10}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {data.externalUrl ? (
              <a
                href={data.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-forest-700 hover:underline"
              >
                View external record <ExternalLink size={12} />
              </a>
            ) : null}
          </section>

          {data.subjects.length > 0 ? (
            <section className="card p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Subjects
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.subjects.map((subject) => (
                  <span
                    key={subject}
                    className="rounded-full border border-line bg-parchment px-2 py-0.5 text-[0.65rem] text-muted"
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <div className="space-y-5">
          <section>
            <p className="eyebrow">Bibliographic record</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-[2.5rem]">
              {data.title}
            </h1>
            {data.subtitle ? (
              <p className="mt-1.5 font-display text-lg text-ink/70">{data.subtitle}</p>
            ) : null}
            <p className="mt-2 text-sm text-muted">
              {data.authors.length > 0 ? data.authors.join(' · ') : 'Author not recorded'}
            </p>
            {data.description ? (
              <article className="prose-library mt-5 rounded-2xl border border-line/80 bg-parchment/60 p-5">
                <p className="whitespace-pre-wrap">{data.description}</p>
              </article>
            ) : null}
            {data.tableOfContents ? (
              <details className="mt-3 rounded-2xl border border-line/80 bg-white/40 p-5">
                <summary className="cursor-pointer font-display text-lg font-semibold text-ink">
                  Table of contents
                </summary>
                <div className="prose-library mt-3 whitespace-pre-wrap text-sm">
                  {data.tableOfContents}
                </div>
              </details>
            ) : null}
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-50 text-forest-600">
                  <Layers size={16} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">Copies in library</h2>
                  <p className="text-xs text-muted">
                    {pluralize(data.itemCount, 'copy')} catalogued for this edition
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setItemDialogOpen(true)}>
                <Plus size={14} />
                Add copy
              </Button>
            </div>

            <div className="space-y-2.5 p-4 sm:p-5">
              {data.items.length > 0 ? (
                data.items.map((item) => (
                  <CopyCard
                    key={item.id}
                    item={item}
                    onEdit={(copy) => {
                      setEditItem(copy);
                      setItemDialogOpen(true);
                    }}
                  />
                ))
              ) : (
                <EmptyState
                  icon={<FileText size={18} />}
                  title="No copies catalogued"
                  description="Add a physical or digital copy to track location, status and condition."
                  action={
                    <Button onClick={() => setItemDialogOpen(true)}>
                      <Plus size={15} />
                      Add first copy
                    </Button>
                  }
                  className="py-10"
                />
              )}
            </div>
          </section>

          {data.fieldSources && Object.keys(data.fieldSources).length > 0 ? (
            <div className="text-[0.65rem] text-muted">
              <span className="inline-flex items-center gap-1">
                <Hash size={11} />
                Metadata fields populated from {data.metadataSource || 'provider'} sources.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <ItemDialog
        open={itemDialogOpen}
        onClose={() => {
          setItemDialogOpen(false);
          setEditItem(null);
        }}
        bookId={data.id}
        bookTitle={data.title}
        item={editItem}
      />

      <ConfirmDialog
        open={deleteBookOpen}
        onClose={() => setDeleteBookOpen(false)}
        onConfirm={handleDeleteBook}
        loading={deletingBook}
        confirmLabel="Delete record"
        title="Delete this bibliographic record?"
        description={
          <span>
            This removes “{data.title}” and its shared edition details. You can only delete records
            that have no catalogue copies.
          </span>
        }
      />
    </div>
  );
}
