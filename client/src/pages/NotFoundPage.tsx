import { Link } from 'react-router-dom';
import { BookX, Home } from 'lucide-react';
import { buttonClasses } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-forest-50 text-forest-500">
        <BookX size={28} />
      </span>
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        This shelf is missing a book. The page you were looking for doesn&apos;t exist or has been
        moved.
      </p>
      <div className="mt-6 flex gap-2">
        <Link to="/" className={buttonClasses('primary', 'md')}>
          <Home size={16} />
          Back to dashboard
        </Link>
        <Link to="/catalog" className={buttonClasses('secondary', 'md')}>
          Browse catalog
        </Link>
      </div>
    </div>
  );
}
