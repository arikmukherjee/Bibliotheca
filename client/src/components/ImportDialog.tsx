import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ImportCommitResult, ImportField, ImportPreview } from '../lib/types';
import { cn, errorMessage, fileSize } from '../lib/utils';
import { useToast } from './Toast';
import { Alert, Button, Field, Modal, Select } from './ui';

const FIELD_LABELS: Record<ImportField, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  authors: 'Authors',
  isbn: 'ISBN (any)',
  isbn10: 'ISBN-10',
  isbn13: 'ISBN-13',
  publisher: 'Publisher',
  publicationDate: 'Publication date',
  publicationYear: 'Publication year',
  edition: 'Edition',
  language: 'Language',
  pageCount: 'Page count',
  description: 'Description',
  seriesTitle: 'Series title',
  seriesVolume: 'Series volume',
  subjects: 'Subjects',
  format: 'Format',
  condition: 'Condition',
  status: 'Status',
  collection: 'Collection',
  shelfLocation: 'Shelf location',
  accessionNumber: 'Accession number',
  acquisitionDate: 'Acquisition date',
  acquisitionSource: 'Acquisition source',
  purchasePrice: 'Purchase price',
  currency: 'Currency',
  tags: 'Tags',
  notes: 'Notes',
};

type Step = 'upload' | 'map' | 'done';

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [activeFields, setActiveFields] = useState<ImportField[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fieldToAdd, setFieldToAdd] = useState('');
  const [strategy, setStrategy] = useState<'add_copy' | 'skip'>('add_copy');
  const [createCollections, setCreateCollections] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportCommitResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setFile(null);
    setPreview(null);
    setActiveFields([]);
    setMapping({});
    setFieldToAdd('');
    setStrategy('add_copy');
    setCreateCollections(true);
    setError('');
    setResult(null);
    setBusy(false);
    setDragging(false);
  }, [open]);

  const unmappedFields = useMemo(
    () => (preview ? preview.availableFields.filter((field) => !activeFields.includes(field)) : []),
    [preview, activeFields],
  );

  const addField = (field: ImportField) => {
    setActiveFields((current) => [...current, field]);
    setFieldToAdd('');
  };

  const removeField = (field: ImportField) => {
    setActiveFields((current) => current.filter((entry) => entry !== field));
    setMapping((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleUpload = async (selected: File) => {
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (extension !== 'csv' && extension !== 'xlsx') {
      setError('Choose a .csv or .xlsx file.');
      return;
    }
    setBusy(true);
    setError('');
    setFile(selected);
    try {
      const parsed = await api.importPreview(selected);
      setPreview(parsed);
      const suggested = parsed.suggestedMapping as Record<string, string | null>;
      const mapped = parsed.availableFields.filter((field) => Boolean(suggested[field]));
      const initial = mapped.includes('title') ? mapped : (['title', ...mapped] as ImportField[]);
      setActiveFields(initial);
      setMapping(
        Object.fromEntries(
          initial
            .map((field) => [field, suggested[field]] as const)
            .filter((entry): entry is [ImportField, string] => Boolean(entry[1])),
        ),
      );
      setStep('map');
    } catch (cause) {
      setError(errorMessage(cause));
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void handleUpload(dropped);
  };

  const handleCommit = async () => {
    if (!preview) return;
    if (!mapping.title) {
      setError('Map a spreadsheet column to Title before importing.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api.commitImport(preview.importId, {
        mapping: Object.fromEntries(activeFields.map((field) => [field, mapping[field] ?? null])),
        duplicateStrategy: strategy,
        createMissingCollections: createCollections,
      });
      setResult(response);
      setStep('done');
      await queryClient.invalidateQueries();
      if (response.failed > 0) {
        toast.info('The import finished with some rows that need attention.');
      } else {
        toast.success(`Imported ${response.processed} rows into your library.`);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setActiveFields([]);
    setMapping({});
    setError('');
    setResult(null);
  };

  const footer =
    step === 'upload' ? (
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
    ) : step === 'map' ? (
      <>
        <Button variant="ghost" onClick={reset} disabled={busy}>
          <ArrowLeft size={15} />
          Start over
        </Button>
        <Button onClick={handleCommit} loading={busy}>
          Import {preview?.rowCount ?? 0} {preview?.rowCount === 1 ? 'row' : 'rows'}
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={reset}>
          <RotateCcw size={15} />
          Import another file
        </Button>
        <Button onClick={onClose}>Done</Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={step === 'map' ? 'xl' : 'lg'}
      title={step === 'done' ? 'Import complete' : 'Import books'}
      description={
        step === 'upload'
          ? 'Bring in a CSV or Excel file, and map its columns to your catalogue fields.'
          : step === 'map'
            ? 'Check the detected columns, map any missing fields, and choose how to handle duplicates.'
            : 'Here is what changed in your library.'
      }
      footer={footer}
    >
      {error ? (
        <Alert tone="danger" className="mb-4" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      {step === 'upload' ? (
        <div className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition',
              dragging
                ? 'border-gold-400 bg-gold-50/60'
                : 'border-line bg-parchment/50 hover:border-forest-300 hover:bg-forest-50/30',
            )}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest-50 text-forest-500">
              <UploadCloud size={26} />
            </div>
            <p className="font-display text-lg font-semibold text-ink">
              Drop a spreadsheet here
            </p>
            <p className="mt-1 text-sm text-muted">CSV or Excel, up to 3,000 rows and 100 columns.</p>
            <Button
              variant="secondary"
              className="mt-5"
              onClick={() => inputRef.current?.click()}
              loading={busy}
            >
              <FileSpreadsheet size={16} />
              Choose a file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void handleUpload(selected);
                event.target.value = '';
              }}
            />
          </div>

          <Alert tone="info">
            A <strong>Title</strong> column is required. Authors, ISBNs, publisher, collection,
            shelf, tags and acquisition details are all detected automatically when present.
          </Alert>

          <div className="rounded-xl border border-line bg-white/40 p-4 text-xs leading-relaxed text-muted">
            <p className="font-semibold text-ink">Tips for a clean import</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Use one row per physical or digital copy.</li>
              <li>Separate multiple authors with semicolons; tags with commas or semicolons.</li>
              <li>ISBNs may be formatted with hyphens or spaces.</li>
            </ul>
          </div>
        </div>
      ) : null}

      {step === 'map' && preview ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-parchment/60 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileSpreadsheet size={18} className="shrink-0 text-forest-500" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{preview.originalName}</p>
                <p className="text-xs text-muted">
                  {preview.rowCount} {preview.rowCount === 1 ? 'row' : 'rows'} ·{' '}
                  {preview.fileType.toUpperCase()}
                  {file ? ` · ${fileSize(file.size)}` : ''}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              Replace file
            </Button>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">Column mapping</h3>
                <p className="text-xs text-muted">Choose which spreadsheet column feeds each field.</p>
              </div>
              <span className="rounded-full border border-line bg-white/60 px-2.5 py-1 text-[0.65rem] font-medium text-muted">
                {activeFields.length} mapped
              </span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {activeFields.map((field) => (
                <div
                  key={field}
                  className={cn(
                    'flex items-end gap-2 rounded-xl border p-2.5',
                    field === 'title'
                      ? 'border-forest-200 bg-forest-50/40'
                      : 'border-line bg-white/40',
                  )}
                >
                  <Field
                    label={FIELD_LABELS[field]}
                    required={field === 'title'}
                    htmlFor={`map-${field}`}
                    className="min-w-0 flex-1"
                  >
                    <Select
                      id={`map-${field}`}
                      value={mapping[field] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMapping((current) => {
                          const next = { ...current };
                          if (value) next[field] = value;
                          else delete next[field];
                          return next;
                        });
                      }}
                      className="h-9 py-1.5 text-xs"
                    >
                      <option value="">— Not mapped —</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {field !== 'title' ? (
                    <button
                      type="button"
                      onClick={() => removeField(field)}
                      className="mb-0.5 rounded-lg p-1.5 text-muted transition hover:bg-red-50 hover:text-danger"
                      aria-label={`Remove ${FIELD_LABELS[field]} mapping`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {unmappedFields.length > 0 ? (
              <div className="mt-3 flex items-center gap-2">
                <Plus size={14} className="text-muted" />
                <Select
                  value={fieldToAdd}
                  onChange={(event) => {
                    const value = event.target.value as ImportField;
                    if (value) addField(value);
                  }}
                  className="h-9 max-w-xs py-1.5 text-xs"
                >
                  <option value="">Add another field…</option>
                  {unmappedFields.map((field) => (
                    <option key={field} value={field}>
                      {FIELD_LABELS[field]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="mb-1 font-display text-lg font-semibold text-ink">Preview</h3>
            <p className="mb-3 text-xs text-muted">The first rows of your file, as they were read.</p>
            <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-forest-800 text-parchment">
                    {preview.headers.map((header) => (
                      <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.slice(0, 5).map((row, index) => (
                    <tr
                      key={index}
                      className={cn('border-t border-line/70', index % 2 === 1 && 'bg-white/40')}
                    >
                      {preview.headers.map((header) => (
                        <td
                          key={header}
                          className="max-w-[16rem] truncate whitespace-nowrap px-3 py-2 text-ink/80"
                          title={row[header]}
                        >
                          {row[header] || <span className="text-muted/40">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-right text-[0.65rem] text-muted">
              Showing {Math.min(5, preview.rowCount)} of {preview.rowCount} rows
            </p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Duplicate ISBNs
              </p>
              <div className="space-y-2">
                {[
                  {
                    value: 'add_copy' as const,
                    title: 'Add another copy',
                    description: 'Attach the row to the existing book record.',
                  },
                  {
                    value: 'skip' as const,
                    title: 'Skip the row',
                    description: 'Leave existing books unchanged.',
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition',
                      strategy === option.value
                        ? 'border-forest-400 bg-forest-50/60'
                        : 'border-line bg-white/40 hover:border-forest-200',
                    )}
                  >
                    <input
                      type="radio"
                      name="duplicate-strategy"
                      checked={strategy === option.value}
                      onChange={() => setStrategy(option.value)}
                      className="mt-0.5 h-4 w-4 accent-forest-700"
                    />
                    <span>
                      <span className="block text-sm font-medium text-ink">{option.title}</span>
                      <span className="mt-0.5 block text-[0.7rem] text-muted">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Collections
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-white/40 p-3">
                <input
                  type="checkbox"
                  checked={createCollections}
                  onChange={(event) => setCreateCollections(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-forest-700"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">Create missing collections</span>
                  <span className="mt-0.5 block text-[0.7rem] text-muted">
                    New collection names found in the file are created automatically.
                  </span>
                </span>
              </label>
              <p className="mt-3 text-[0.7rem] leading-relaxed text-muted">
                Invalid rows are reported individually and do not stop the rest of the import.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {step === 'done' && result ? (
        <div className="space-y-5">
          <div className="flex flex-col items-center rounded-2xl border border-forest-200 bg-forest-50/60 px-6 py-7 text-center">
            <CheckCircle2 size={34} className="text-forest-600" />
            <p className="mt-2 font-display text-xl font-semibold text-ink">
              {result.createdBooks + result.addedCopies > 0
                ? 'Your library has grown.'
                : 'Import finished.'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {result.processed} {result.processed === 1 ? 'row was' : 'rows were'} processed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { label: 'Books added', value: result.createdBooks },
              { label: 'Copies added', value: result.addedCopies },
              { label: 'Skipped', value: result.skipped },
              { label: 'Failed', value: result.failed },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-line bg-white/50 p-3 text-center">
                <p className="font-display text-2xl font-semibold text-ink">{item.value}</p>
                <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-muted">{item.label}</p>
              </div>
            ))}
          </div>

          {result.warnings.length > 0 ? (
            <Alert tone="warning" title="Warnings">
              <ul className="list-disc space-y-1 pl-4">
                {result.warnings.slice(0, 8).map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {result.errors.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger">
                <XCircle size={16} />
                Rows that could not be imported
              </div>
              <div className="scrollbar-thin max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50/40">
                <ul className="divide-y divide-red-100 text-xs">
                  {result.errors.slice(0, 20).map((rowError) => (
                    <li key={`${rowError.row}-${rowError.message}`} className="flex gap-3 px-3 py-2">
                      <span className="shrink-0 font-mono text-[0.65rem] text-danger/70">
                        Row {rowError.row}
                      </span>
                      <span className="text-ink/75">{rowError.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
