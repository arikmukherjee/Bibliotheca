import { useEffect, useState } from 'react';
import { Braces, Download, FileSpreadsheet, FileText, FileType2 } from 'lucide-react';
import { api, type QueryValue } from '../lib/api';
import { cn, errorMessage } from '../lib/utils';
import { useToast } from './Toast';
import { Alert, Button, Modal } from './ui';

type Format = 'csv' | 'xlsx' | 'json' | 'pdf';

const FORMATS: Array<{
  value: Format;
  label: string;
  description: string;
  icon: typeof FileText;
  accent: string;
}> = [
  {
    value: 'csv',
    label: 'CSV',
    description: 'Universal, opens anywhere',
    icon: FileText,
    accent: 'text-forest-600 bg-forest-50 border-forest-200',
  },
  {
    value: 'xlsx',
    label: 'Excel',
    description: 'Formatted spreadsheet',
    icon: FileSpreadsheet,
    accent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  {
    value: 'json',
    label: 'JSON',
    description: 'Complete structured data',
    icon: Braces,
    accent: 'text-gold-700 bg-gold-50 border-gold-200',
  },
  {
    value: 'pdf',
    label: 'PDF',
    description: 'A printable catalogue',
    icon: FileType2,
    accent: 'text-[#9b3a32] bg-red-50 border-red-200',
  },
];

export function ExportDialog({
  open,
  onClose,
  filters,
  filterLabel,
}: {
  open: boolean;
  onClose: () => void;
  filters?: Record<string, QueryValue>;
  filterLabel?: string;
}) {
  const toast = useToast();
  const [format, setFormat] = useState<Format>('csv');
  const [scope, setScope] = useState<'all' | 'filtered'>('all');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const hasFilters = Boolean(filters && Object.values(filters).some((value) => value !== '' && value != null));

  useEffect(() => {
    if (!open) return;
    setError('');
    setScope(hasFilters ? 'filtered' : 'all');
  }, [open, hasFilters]);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const params: Record<string, QueryValue> = {
        fileFormat: format,
        ...(scope === 'filtered' && filters ? filters : {}),
      };
      const { blob, filename } = await api.exportLibrary(params);
      api.downloadBlob(blob, filename);
      toast.success(`Your ${format.toUpperCase()} export is downloading.`);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export your library"
      description="Download your catalogue as a file you can keep, print or share."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} loading={exporting}>
            <Download size={16} />
            Export {format.toUpperCase()}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">File format</p>
          <div className="grid grid-cols-2 gap-2.5">
            {FORMATS.map((item) => {
              const Icon = item.icon;
              const selected = format === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormat(item.value)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left transition',
                    selected
                      ? 'border-forest-400 bg-forest-50/70 ring-2 ring-forest-100'
                      : 'border-line bg-white/50 hover:border-forest-200 hover:bg-parchment',
                  )}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', item.accent)}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{item.label}</span>
                    <span className="block truncate text-[0.7rem] text-muted">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {hasFilters ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">What to export</p>
            <div className="space-y-2">
              {[
                {
                  value: 'filtered' as const,
                  title: filterLabel || 'The current catalog view',
                  description: 'Only items matching your active search and filters.',
                },
                {
                  value: 'all' as const,
                  title: 'The entire library',
                  description: 'Every catalogue item, ignoring the current filters.',
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition',
                    scope === option.value
                      ? 'border-forest-400 bg-forest-50/60'
                      : 'border-line bg-white/40 hover:border-forest-200',
                  )}
                >
                  <input
                    type="radio"
                    name="export-scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    className="mt-0.5 h-4 w-4 accent-forest-700"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">{option.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <Alert tone="info">
            The export includes every catalogue item, with bibliographic details, copy information,
            collections, tags and acquisition records.
          </Alert>
        )}
      </div>
    </Modal>
  );
}
