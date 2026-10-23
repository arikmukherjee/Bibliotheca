import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookMarked,
  FolderHeart,
  LayoutDashboard,
  LibraryBig,
  Menu,
  PlusCircle,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/catalog', label: 'Catalog', icon: LibraryBig },
  { to: '/add', label: 'Add a book', icon: PlusCircle },
  { to: '/collections', label: 'Collections', icon: FolderHeart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-7 pt-7">
        <NavLink to="/" onClick={onNavigate} className="group flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold-400/30 bg-gold-500/10 text-gold-300 transition group-hover:bg-gold-500/20">
            <BookMarked size={22} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[1.35rem] font-semibold leading-none tracking-tight text-parchment">
              Bibliotheca
            </span>
            <span className="mt-1.5 block text-[0.62rem] font-medium uppercase tracking-[0.22em] text-gold-300/75">
              Every book · one library
            </span>
          </span>
        </NavLink>
      </div>

      <div className="px-4">
        <NavLink
          to="/add"
          onClick={onNavigate}
          className="flex items-center justify-between gap-3 rounded-xl border border-gold-400/25 bg-gold-500/10 px-3.5 py-3 text-sm font-medium text-gold-100 transition hover:border-gold-400/50 hover:bg-gold-500/15"
        >
          <span className="flex items-center gap-2.5">
            <PlusCircle size={17} className="text-gold-300" />
            Catalogue a new book
          </span>
          <span className="rounded-md border border-gold-400/30 px-1.5 py-0.5 text-[0.62rem] uppercase tracking-wider text-gold-300">
            Add
          </span>
        </NavLink>
      </div>

      <nav className="mt-6 flex-1 space-y-1 px-3" aria-label="Main navigation">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-parchment/10 text-parchment'
                  : 'text-parchment/60 hover:bg-parchment/5 hover:text-parchment/90',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-400 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <item.icon
                  size={18}
                  className={cn(
                    'shrink-0 transition-colors',
                    isActive ? 'text-gold-300' : 'text-parchment/40 group-hover:text-parchment/70',
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 pb-6 pt-4">
        <div className="rounded-xl border border-parchment/10 bg-parchment/[0.04] px-4 py-3.5">
          <p className="font-display text-sm italic text-parchment/75">
            “A room without books is like a body without a soul.”
          </p>
          <p className="mt-2 text-[0.62rem] uppercase tracking-[0.16em] text-parchment/35">
            Cicero
          </p>
        </div>
        <p className="mt-4 text-center text-[0.6rem] uppercase tracking-[0.2em] text-parchment/25">
          Private catalogue · v1.0
        </p>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-ivory">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-forest-900/40 bg-gradient-to-b from-forest-950 via-forest-900 to-forest-950 lg:block">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/80 bg-ivory/90 px-4 py-3 backdrop-blur lg:hidden">
        <NavLink to="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest-800 text-gold-300">
            <BookMarked size={16} />
          </span>
          <span className="font-display text-lg font-semibold text-ink">Bibliotheca</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="rounded-lg border border-line bg-parchment p-2 text-ink"
          aria-label="Open navigation"
        >
          <Menu size={19} />
        </button>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-forest-950/50 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(19rem,88vw)] bg-gradient-to-b from-forest-950 via-forest-900 to-forest-950 shadow-lift animate-fade-up">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-parchment/60 hover:bg-parchment/10 hover:text-parchment"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      ) : null}

      <main className="lg:pl-72">
        <div className="relative mx-auto max-w-page px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pb-20 lg:pt-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(ellipse_at_top_right,rgba(210,164,75,0.09),transparent_62%)]"
          />
          <div key={location.pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
