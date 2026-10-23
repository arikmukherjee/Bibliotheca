import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { cn, coverGradient } from '../lib/utils';

export function BookCover({
  url,
  title,
  authors = [],
  className,
  imageClassName,
  rounded = 'rounded-xl',
  showSpine = true,
}: {
  url: string | null | undefined;
  title: string;
  authors?: string[];
  className?: string;
  imageClassName?: string;
  rounded?: string;
  showSpine?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const showImage = Boolean(url) && !failed;

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-forest-100 shadow-book',
        rounded,
        className,
      )}
    >
      {showImage ? (
        <img
          src={url ?? ''}
          alt={`Cover of ${title}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', imageClassName)}
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full flex-col items-center justify-center bg-gradient-to-br p-4 text-center',
            coverGradient(title),
          )}
        >
          <BookOpen className="mb-2 text-white/45" size={22} />
          <p className="line-clamp-4 font-display text-sm font-medium leading-snug text-white/90">
            {title}
          </p>
          {authors.length > 0 ? (
            <p className="mt-1.5 line-clamp-2 text-[0.65rem] uppercase tracking-[0.12em] text-white/55">
              {authors.join(' · ')}
            </p>
          ) : null}
        </div>
      )}
      {showSpine ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/25 via-black/5 to-transparent"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10"
      />
    </div>
  );
}
