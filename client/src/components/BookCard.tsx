import { Link } from 'react-router-dom';
import { BookOpen, Layers, MapPin, MonitorSmartphone } from 'lucide-react';
import type { CatalogEntry } from '../lib/types';
import { cn, formatLabel, statusLabel, statusStyle } from '../lib/utils';
import { BookCover } from './BookCover';

export function BookCard({ entry, className }: { entry: CatalogEntry; className?: string }) {
  const { book } = entry;

  return (
    <Link
      to={`/books/${book.id}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-parchment shadow-card transition duration-200 hover:-translate-y-1 hover:border-forest-200 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ivory',
        className,
      )}
    >
      <div className="relative flex justify-center overflow-hidden bg-gradient-to-b from-forest-50/80 to-ivory px-6 pb-5 pt-6">
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-parchment/80 to-transparent" />
        <BookCover
          url={book.coverImageUrl}
          title={book.title}
          authors={book.authors}
          className="relative aspect-[2/3] w-[58%] transition duration-300 group-hover:scale-[1.03] group-hover:rotate-[0.6deg]"
        />
        <span
          className={cn(
            'absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.62rem] font-medium',
            statusStyle(entry.itemStatus),
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {statusLabel(entry.itemStatus)}
        </span>
        {entry.copyCount > 1 ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-line bg-parchment/90 px-2 py-0.5 text-[0.62rem] font-medium text-muted shadow-sm">
            <Layers size={11} />
            {entry.copyCount}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col border-t border-line/60 px-4 pb-4 pt-3.5">
        <h3 className="line-clamp-2 font-display text-[1.02rem] font-semibold leading-snug text-ink transition group-hover:text-forest-700">
          {book.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-muted">
          {book.authors.length > 0 ? book.authors.join(' · ') : 'Unknown author'}
        </p>

        <div className="mt-auto flex items-center gap-2 pt-3 text-[0.68rem] text-muted">
          <span className="inline-flex items-center gap-1">
            {entry.format === 'digital' ? <MonitorSmartphone size={12} /> : <BookOpen size={12} />}
            {formatLabel(entry.format)}
          </span>
          {book.publicationYear ? (
            <>
              <span className="text-line">·</span>
              <span>{book.publicationYear}</span>
            </>
          ) : null}
          {entry.shelfLocation ? (
            <>
              <span className="text-line">·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{entry.shelfLocation}</span>
              </span>
            </>
          ) : null}
        </div>

        {entry.collection ? (
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-line/50 pt-2.5 text-[0.65rem] text-muted">
            <span
              className="h-2 w-2 rounded-full ring-2 ring-white"
              style={{ backgroundColor: entry.collection.color }}
            />
            <span className="truncate">{entry.collection.name}</span>
            <span className="ml-auto font-mono text-[0.6rem] tracking-tight text-muted/60">
              {entry.itemCode}
            </span>
          </div>
        ) : (
          <div className="mt-2.5 border-t border-line/50 pt-2.5 text-[0.65rem] text-muted/70">
            <span className="font-mono text-[0.6rem] tracking-tight">{entry.itemCode}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
