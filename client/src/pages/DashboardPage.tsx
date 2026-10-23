import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  CircleAlert,
  Clock3,
  Download,
  FolderHeart,
  ImageOff,
  LibraryBig,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { CatalogEntry } from '../lib/types';
import { cn, errorMessage, formatLabel, pluralize, statusLabel, timeAgo } from '../lib/utils';
import { useSettings, useStats } from '../lib/queries';
import { BookCover } from '../components/BookCover';
import { ExportDialog } from '../components/ExportDialog';
import { ImportDialog } from '../components/ImportDialog';
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  buttonClasses,
} from '../components/ui';

function StatCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className="card flex items-start gap-3.5 p-4 sm:p-5">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', accent)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
        <p className="mt-1 font-display text-[1.65rem] font-semibold leading-none text-ink">{value}</p>
        <p className="mt-1.5 truncate text-[0.7rem] text-muted">{detail}</p>
      </div>
    </div>
  );
}

function RecentRow({ entry }: { entry: CatalogEntry }) {
  return (
    <Link
      to={`/books/${entry.book.id}`}
      className="group flex items-center gap-3.5 rounded-xl px-2 py-2.5 transition hover:bg-forest-50/50"
    >
      <BookCover
        url={entry.book.coverImageUrl}
        title={entry.book.title}
        authors={entry.book.authors}
        className="h-[4.2rem] w-12 shrink-0 rounded-md"
        showSpine={false}
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 font-display text-sm font-semibold text-ink transition group-hover:text-forest-700">
          {entry.book.title}
        </p>
        <p className="line-clamp-1 text-xs text-muted">
          {entry.book.authors.join(' · ') || 'Unknown author'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] text-muted/80">
          <span>{formatLabel(entry.format)}</span>
          {entry.collection ? (
            <>
              <span className="text-line">·</span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: entry.collection.color }}
                />
                {entry.collection.name}
              </span>
            </>
          ) : null}
          {entry.shelfLocation ? (
            <>
              <span className="text-line">·</span>
              <span>{entry.shelfLocation}</span>
            </>
          ) : null}
        </div>
      </div>
      <span className="hidden shrink-0 rounded-full border border-line bg-white/50 px-2 py-0.5 text-[0.62rem] text-muted sm:inline-flex">
        {statusLabel(entry.itemStatus)}
      </span>
      <ArrowRight
        size={14}
        className="shrink-0 text-muted/30 transition group-hover:translate-x-0.5 group-hover:text-forest-500"
      />
    </Link>
  );
}

export function DashboardPage() {
  const stats = useStats();
  const settings = useSettings();
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const libraryName = settings.data?.values.library_name ?? 'My Library';

  if (stats.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (stats.isError) {
    return (
      <div className="card p-10 text-center">
        <CircleAlert className="mx-auto text-danger" />
        <h1 className="mt-3 font-display text-2xl font-semibold">The library is out of reach</h1>
        <p className="mt-1 text-sm text-muted">{errorMessage(stats.error)}</p>
        <Button className="mt-5" onClick={() => void stats.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = stats.data!;
  const empty = data.totals.books === 0;
  const physicalPct =
    data.totals.items > 0 ? Math.round((data.totals.physical / data.totals.items) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={today}
        title={empty ? 'Begin your library' : libraryName}
        description={
          empty
            ? 'A quiet home for every book you own, borrow, read and love.'
            : `${pluralize(data.totals.books, 'edition')} and ${pluralize(data.totals.items, 'copy', 'copies')}, arranged and cared for.`
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="secondary" onClick={() => setExportOpen(true)} disabled={empty}>
              <Download size={15} />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Link to="/add" className={buttonClasses('primary', 'md')}>
              <Plus size={16} />
              Add a book
            </Link>
          </>
        }
      />

      {empty ? (
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-3xl border border-forest-800/20 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-950 px-6 py-14 text-center shadow-lift sm:px-10 sm:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-forest-400/10 blur-3xl"
            />
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold-400/30 bg-gold-500/10 text-gold-300">
              <BookMarked size={30} />
            </span>
            <h2 className="mx-auto mt-5 max-w-xl font-display text-3xl font-semibold leading-tight text-parchment sm:text-4xl">
              Every book deserves a proper catalogue.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-parchment/60">
              Identify an edition by title, ISBN or a photograph of its cover. Bibliotheca fills in
              the details, then keeps your copies, shelves and reading life in order.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              <Link to="/add" className={buttonClasses('gold', 'lg')}>
                <Sparkles size={17} />
                Catalogue your first book
              </Link>
            <Button
              variant="secondary"
              size="lg"
              className="border-parchment/20 bg-parchment/5 text-parchment hover:bg-parchment/10"
              onClick={() => setImportOpen(true)}
            >
              <Upload size={16} />
              Import a spreadsheet
            </Button>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: <Sparkles size={19} />,
                title: 'Identify editions',
                body: 'Search Google Books and Open Library, look up an ISBN, or scan a cover photo.',
              },
              {
                icon: <LibraryBig size={19} />,
                title: 'Catalogue every copy',
                body: 'Track physical and digital copies, condition, shelving, loans and provenance.',
              },
              {
                icon: <Download size={19} />,
                title: 'Own your data',
                body: 'Export the whole library or any filtered view as CSV, Excel, JSON or a printed PDF.',
              },
            ].map((feature) => (
              <div key={feature.title} className="card p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-50 text-forest-600">
                  {feature.icon}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold text-ink">{feature.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Editions"
              value={data.totals.books}
              detail={`${data.health.completeBooks} with complete metadata`}
              icon={<BookMarked size={18} />}
              accent="bg-forest-50 text-forest-600"
            />
            <StatCard
              label="Copies"
              value={data.totals.items}
              detail={`${data.totals.physical} physical · ${data.totals.digital} digital`}
              icon={<BookOpen size={18} />}
              accent="bg-gold-50 text-gold-600"
            />
            <StatCard
              label="Collections"
              value={data.totals.collections}
              detail={
                data.collections.length > 0
                  ? data.collections
                      .slice(0, 2)
                      .map((collection) => collection.name)
                      .join(', ')
                  : 'No collections yet'
              }
              icon={<FolderHeart size={18} />}
              accent="bg-stone-100 text-stone-600"
            />
            <StatCard
              label="Completeness"
              value={`${data.health.percentage}%`}
              detail={
                data.totals.missingMetadata === 0
                  ? 'Every record is in good order'
                  : `${data.totals.missingMetadata} need attention`
              }
              icon={<Sparkles size={18} />}
              accent="bg-emerald-50 text-emerald-600"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <section className="card p-5 sm:p-6">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">Recently shelved</h2>
                  <p className="text-xs text-muted">The latest copies to join the catalogue.</p>
                </div>
                <Link
                  to="/catalog"
                  className="inline-flex items-center gap-1 text-xs font-medium text-forest-700 hover:underline"
                >
                  View catalog <ArrowRight size={12} />
                </Link>
              </div>

              {data.recentItems.length > 0 ? (
                <div className="divide-y divide-line/60">
                  {data.recentItems.map((entry) => (
                    <RecentRow key={entry.id} entry={entry} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<LibraryBig size={18} />}
                  title="No catalogued copies yet"
                  description="Bibliographic records without a copy appear under the items that need attention."
                  className="py-10"
                />
              )}

              {data.collections.length > 0 ? (
                <div className="mt-5 border-t border-line/70 pt-4">
                  <div className="mb-2.5 flex items-center justify-between">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                      Browse collections
                    </p>
                    <Link to="/collections" className="text-[0.68rem] text-forest-700 hover:underline">
                      Manage
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.collections.slice(0, 6).map((collection) => (
                      <Link
                        key={collection.id}
                        to={`/catalog?collectionId=${collection.id}`}
                        className="inline-flex items-center gap-2 rounded-full border border-line bg-white/50 px-3 py-1.5 text-xs text-ink transition hover:border-forest-200 hover:bg-forest-50/50"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: collection.color }}
                        />
                        {collection.name}
                        <span className="text-[0.62rem] text-muted">{collection.itemCount}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <div className="space-y-5">
              <section className="card p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink">Library health</h2>
                    <p className="text-xs text-muted">Where a little care is needed.</p>
                  </div>
                  <div
                    className="relative flex h-16 w-16 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(#2C5D48 ${data.health.percentage * 3.6}deg, #E4DDCC 0deg)`,
                    }}
                    title={`${data.health.percentage}% complete`}
                  >
                    <div className="flex h-[3.2rem] w-[3.2rem] items-center justify-center rounded-full bg-parchment">
                      <span className="font-display text-sm font-semibold text-forest-700">
                        {data.health.percentage}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    {
                      label: 'Incomplete metadata',
                      count: data.totals.missingMetadata,
                      icon: <CircleAlert size={15} />,
                      to: '/catalog?missingMetadata=true',
                    },
                    {
                      label: 'Missing covers',
                      count: data.totals.missingCover,
                      icon: <ImageOff size={15} />,
                      to: '/catalog?missingCover=true',
                    },
                    {
                      label: 'Records without copies',
                      count: data.totals.orphanedBooks,
                      icon: <BookOpen size={15} />,
                      to: '/catalog',
                    },
                  ].map((row) => (
                    <Link
                      key={row.label}
                      to={row.to}
                      className="flex items-center gap-3 rounded-xl border border-line/70 bg-white/35 px-3 py-2.5 transition hover:border-forest-200 hover:bg-forest-50/40"
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-lg',
                          row.count > 0
                            ? 'bg-gold-50 text-gold-700'
                            : 'bg-forest-50 text-forest-500',
                        )}
                      >
                        {row.icon}
                      </span>
                      <span className="flex-1 text-xs font-medium text-ink">{row.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[0.65rem] font-semibold',
                          row.count > 0
                            ? 'bg-gold-100 text-gold-800'
                            : 'bg-forest-50 text-forest-600',
                        )}
                      >
                        {row.count}
                      </span>
                    </Link>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3 text-[0.68rem] text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen size={12} />
                    {physicalPct}% physical collection
                  </span>
                  <Link to="/settings" className="text-forest-700 hover:underline">
                    Library settings
                  </Link>
                </div>
              </section>

              <section className="card p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 size={16} className="text-gold-600" />
                  <h2 className="font-display text-xl font-semibold text-ink">Library activity</h2>
                </div>
                {data.activity.length > 0 ? (
                  <ol className="space-y-3">
                    {data.activity.slice(0, 5).map((entry, index) => (
                      <li key={entry.id} className="relative flex gap-3 pl-1">
                        <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              index === 0 ? 'bg-gold-500' : 'bg-forest-200',
                            )}
                          />
                          {index < Math.min(data.activity.length, 5) - 1 ? (
                            <span className="absolute left-1/2 top-2 h-[1.9rem] w-px -translate-x-1/2 bg-line" />
                          ) : null}
                        </span>
                        <div className="min-w-0 pb-0.5">
                          <p className="line-clamp-2 text-xs leading-relaxed text-ink/80">
                            {entry.summary}
                          </p>
                          <p className="mt-0.5 text-[0.62rem] text-muted">{timeAgo(entry.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="py-6 text-center text-xs text-muted">
                    Activity will appear here as you catalogue and change your library.
                  </p>
                )}
              </section>
            </div>
          </div>

          {data.totals.missingMetadata > 0 ? (
            <Alert tone="info" title="A tidy catalogue is a useful catalogue">
              <span className="text-xs">
                {pluralize(data.totals.missingMetadata, 'record')} still need an ISBN, publisher,
                publication date or author.{' '}
                <Link to="/catalog?missingMetadata=true" className="font-medium underline">
                  Review them now
                </Link>
                .
              </span>
            </Alert>
          ) : null}
        </>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
