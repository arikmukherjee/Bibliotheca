import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera,
  Check,
  ExternalLink,
  Hash,
  Library,
  Loader2,
  Search,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ExistingBookRef, ImageIdentificationResult, MetadataCandidate } from '../lib/types';
import { cn, errorMessage } from '../lib/utils';
import { useToast } from './Toast';
import { Alert, Badge, Button, EmptyState, Input } from './ui';
import { BookCover } from './BookCover';

type Mode = 'search' | 'isbn' | 'photo';

const PROVIDER_LABELS = {
  google_books: 'Google Books',
  open_library: 'Open Library',
};

function CandidateCard({
  candidate,
  onSelect,
}: {
  candidate: MetadataCandidate;
  onSelect: (candidate: MetadataCandidate) => void;
}) {
  return (
    <div className="group flex gap-3 rounded-xl border border-line bg-white/55 p-3 transition hover:border-forest-200 hover:bg-parchment">
      <BookCover
        url={candidate.coverImageUrl}
        title={candidate.title}
        authors={candidate.authors}
        className="h-[5.6rem] w-14 shrink-0 rounded-lg"
        showSpine={false}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 font-display text-sm font-semibold leading-snug text-ink">
              {candidate.title}
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted">
              {candidate.authors.length > 0 ? candidate.authors.join(' · ') : 'Unknown author'}
            </p>
            <p className="mt-1 text-[0.68rem] text-muted/80">
              {[candidate.publisher, candidate.publicationYear].filter(Boolean).join(' · ') ||
                'Publication details unavailable'}
            </p>
          </div>
          <Badge tone={candidate.confidence === 'high' ? 'forest' : candidate.confidence === 'medium' ? 'gold' : 'neutral'}>
            {candidate.confidence}
          </Badge>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-forest-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-forest-600">
            {PROVIDER_LABELS[candidate.primaryProvider]}
          </span>
          {candidate.isbn13 ? (
            <span className="font-mono text-[0.6rem] text-muted">{candidate.isbn13}</span>
          ) : null}
          {candidate.existingBook ? (
            <Badge tone="gold">
              <Library size={10} />
              In library
            </Badge>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            {candidate.existingBook ? (
              <Link
                to={`/books/${candidate.existingBook.id}`}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[0.68rem] font-medium text-forest-700 hover:bg-forest-50"
              >
                Open
                <ExternalLink size={11} />
              </Link>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => onSelect(candidate)}>
              <Check size={13} />
              Use
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LookupPanel({
  onSelect,
}: {
  onSelect: (candidate: MetadataCandidate) => void;
}) {
  const toast = useToast();
  const photoInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('search');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<MetadataCandidate[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [existingBook, setExistingBook] = useState<ExistingBookRef | null>(null);
  const [imageResult, setImageResult] = useState<ImageIdentificationResult | null>(null);
  const [searched, setSearched] = useState(false);

  const clearResults = () => {
    setCandidates([]);
    setWarnings([]);
    setNotes([]);
    setExistingBook(null);
    setImageResult(null);
    setSearched(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    clearResults();
  };

  const handleSearch = async () => {
    if (!title.trim()) {
      setError('Enter a title to search for editions.');
      return;
    }
    setBusy(true);
    setError('');
    clearResults();
    try {
      const response = await api.searchMetadata({
        title: title.trim(),
        author: author.trim() || undefined,
      });
      setCandidates(response.data);
      setWarnings(response.warnings);
      setSearched(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleIsbn = async () => {
    if (isbn.trim().length < 10) {
      setError('Enter a complete ISBN-10 or ISBN-13.');
      return;
    }
    setBusy(true);
    setError('');
    clearResults();
    try {
      const response = await api.lookupIsbn({ isbn: isbn.trim() });
      setCandidates(response.data.candidates);
      setWarnings(response.data.warnings);
      setExistingBook(response.data.existingBook);
      setSearched(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const handlePhoto = async (file: File) => {
    setBusy(true);
    setError('');
    clearResults();
    try {
      const result = await api.identifyImage(file);
      setImageResult(result);
      setCandidates(result.candidates);
      setWarnings(result.warnings);
      setNotes(result.notes);
      setSearched(true);
      if (result.candidates.length === 0) {
        toast.info('No matching edition was found from that photo. You can enter the details manually.');
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const choose = (candidate: MetadataCandidate) => {
    onSelect(candidate);
    toast.success('Edition details applied to the form.', 'Metadata found');
  };

  const tabs: Array<{ value: Mode; label: string; icon: typeof Search }> = [
    { value: 'search', label: 'Search', icon: Search },
    { value: 'isbn', label: 'ISBN', icon: Hash },
    { value: 'photo', label: 'Photo', icon: Camera },
  ];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line/70 bg-gradient-to-r from-forest-50/70 to-gold-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest-700 text-gold-300">
            <Sparkles size={17} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Find the edition first</h2>
            <p className="text-xs text-muted">
              Pull in reliable metadata from Google Books and Open Library, or scan a cover.
            </p>
          </div>
        </div>
        <div className="flex rounded-lg border border-line bg-white/60 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchMode(tab.value)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-none',
                mode === tab.value
                  ? 'bg-forest-700 text-parchment shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {mode === 'search' ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="Book title, e.g. The Left Hand of Darkness"
              aria-label="Book title"
            />
            <Input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="Author (optional)"
              aria-label="Author"
              className="sm:max-w-[15rem]"
            />
            <Button onClick={handleSearch} disabled={busy} className="shrink-0">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              Search
            </Button>
          </div>
        ) : null}

        {mode === 'isbn' ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={isbn}
              onChange={(event) => setIsbn(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleIsbn();
                }
              }}
              placeholder="ISBN-10 or ISBN-13"
              inputMode="numeric"
              aria-label="ISBN"
            />
            <Button onClick={handleIsbn} disabled={busy} className="shrink-0">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Hash size={15} />}
              Look up ISBN
            </Button>
          </div>
        ) : null}

        {mode === 'photo' ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-parchment/40 px-5 py-8 text-center">
            <Camera size={24} className="text-forest-500" />
            <p className="mt-2 text-sm font-medium text-ink">Identify a book from a photo</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
              Photograph the front cover or the ISBN barcode page. We will read the barcode and any
              visible title text, then search for the edition.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => photoInput.current?.click()}
              loading={busy}
            >
              <Camera size={14} />
              Choose a photo
            </Button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handlePhoto(file);
                event.target.value = '';
              }}
            />
          </div>
        ) : null}

        {error ? (
          <Alert tone="danger" onDismiss={() => setError('')}>
            {error}
          </Alert>
        ) : null}

        {imageResult ? (
          <div className="rounded-xl border border-line bg-white/40 p-3 text-xs text-muted">
            <p className="font-medium text-ink">
              Photo analysis
              {imageResult.usedIsbn ? ` · recognised ISBN ${imageResult.usedIsbn}` : ''}
            </p>
            <p className="mt-1">
              {imageResult.extraction.extractedIsbns.length} ISBN
              {imageResult.extraction.extractedIsbns.length === 1 ? '' : 's'} detected
              {imageResult.extraction.ocr.available
                ? ` · text recognition ${imageResult.extraction.ocr.confidence !== null ? `${Math.round(imageResult.extraction.ocr.confidence)}% confidence` : 'available'}`
                : ' · text recognition unavailable'}
              {imageResult.extraction.hints.title ? ` · “${imageResult.extraction.hints.title}”` : ''}
            </p>
            {notes.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            ) : null}
            {imageResult.searchMode === 'none' ? (
              <p className="mt-1 text-gold-700">
                No usable ISBN or title was found. Try a sharper photo, or enter the details below.
              </p>
            ) : null}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <Alert tone="warning" className="text-xs">
            <div className="flex items-start gap-2">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <ul className="space-y-0.5">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          </Alert>
        ) : null}

        {existingBook ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold-200 bg-gold-50/70 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BookCover
                url={existingBook.coverImageUrl}
                title={existingBook.title}
                authors={existingBook.authors}
                className="h-12 w-9 shrink-0 rounded"
                showSpine={false}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Already in your library</p>
                <p className="truncate text-xs text-muted">
                  “{existingBook.title}” · {existingBook.itemCount}{' '}
                  {existingBook.itemCount === 1 ? 'copy' : 'copies'}
                </p>
              </div>
            </div>
            <Link
              to={`/books/${existingBook.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold-300 bg-white/70 px-3 text-xs font-medium text-gold-800 hover:bg-white"
            >
              Open record
              <ExternalLink size={12} />
            </Link>
          </div>
        ) : null}

        {busy && candidates.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" />
            Searching library catalogues…
          </div>
        ) : null}

        {candidates.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {candidates.length} possible {candidates.length === 1 ? 'edition' : 'editions'}
              </p>
              <p className="text-[0.65rem] text-muted">Choose the closest match</p>
            </div>
            <div className="scrollbar-thin max-h-[22rem] space-y-2 overflow-y-auto pr-1">
              {candidates.map((candidate) => (
                <CandidateCard key={candidate.candidateId} candidate={candidate} onSelect={choose} />
              ))}
            </div>
          </div>
        ) : searched && !busy && !error ? (
          <EmptyState
            icon={<Search size={18} />}
            title="No editions found"
            description="Try a simpler title or search by ISBN. You can always enter the details by hand below."
            className="py-8"
          />
        ) : null}
      </div>
    </section>
  );
}
