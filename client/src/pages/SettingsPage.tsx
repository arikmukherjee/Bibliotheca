import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Database, KeyRound, RefreshCw, Server, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/utils';
import { useSettings } from '../lib/queries';
import { useToast } from '../components/Toast';
import { ExportDialog } from '../components/ExportDialog';
import { ImportDialog } from '../components/ImportDialog';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from '../components/ui';

export function SettingsPage() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    library_name: '',
    default_currency: 'USD',
    default_format: 'physical',
    default_condition: 'good',
  });
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setForm({
        library_name: settings.data.values.library_name ?? '',
        default_currency: settings.data.values.default_currency ?? 'USD',
        default_format: settings.data.values.default_format ?? 'physical',
        default_condition: settings.data.values.default_condition ?? 'good',
      });
    }
  }, [settings.data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(form);
      await queryClient.invalidateQueries();
      toast.success('Library settings saved.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const removed = await api.clearCache();
      await queryClient.invalidateQueries();
      toast.success(
        removed === 0
          ? 'No cached metadata entries to clear.'
          : `Cleared ${removed} cached metadata ${removed === 1 ? 'entry' : 'entries'}.`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setClearing(false);
    }
  };

  if (settings.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-16 w-1/3" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (settings.isError) {
    return (
      <div className="card p-10 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Settings unavailable</h1>
        <p className="mt-1 text-sm text-muted">{errorMessage(settings.error)}</p>
        <Button className="mt-5" onClick={() => void settings.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = settings.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Personalise defaults, check integrations and manage your catalogue."
        actions={
          <Button onClick={handleSave} loading={saving}>
            Save settings
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <section className="card p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Library</h2>
            <p className="mt-0.5 text-sm text-muted">Name and defaults used when cataloguing.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Library name" htmlFor="lib-name" className="sm:col-span-2">
                <Input
                  id="lib-name"
                  value={form.library_name}
                  onChange={(event) => setForm((current) => ({ ...current, library_name: event.target.value }))}
                />
              </Field>
              <Field label="Default currency" htmlFor="lib-currency">
                <Input
                  id="lib-currency"
                  value={form.default_currency}
                  maxLength={3}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, default_currency: event.target.value.toUpperCase() }))
                  }
                  className="uppercase"
                />
              </Field>
              <Field label="Default format" htmlFor="lib-format">
                <Select
                  id="lib-format"
                  value={form.default_format}
                  onChange={(event) => setForm((current) => ({ ...current, default_format: event.target.value }))}
                >
                  <option value="physical">Physical</option>
                  <option value="digital">Digital</option>
                </Select>
              </Field>
              <Field label="Default condition" htmlFor="lib-condition" className="sm:col-span-2">
                <Select
                  id="lib-condition"
                  value={form.default_condition}
                  onChange={(event) => setForm((current) => ({ ...current, default_condition: event.target.value }))}
                >
                  <option value="new">New</option>
                  <option value="like_new">Like new</option>
                  <option value="very_good">Very good</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </Select>
              </Field>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">Data</h2>
                <p className="mt-0.5 text-sm text-muted">Import, export and maintain your catalogue.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload size={14} />
                  Import
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)}>
                  <Download size={14} />
                  Export
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-white/40 p-3.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                  Bibliographic records
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink">
                  {data?.library.bibliographicRecords ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-white/40 p-3.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                  Catalogue items
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink">
                  {data?.library.catalogItems ?? 0}
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-gold-600" />
              <h2 className="font-display text-lg font-semibold text-ink">Integrations</h2>
            </div>
            <div className="mt-3 space-y-2">
              {[
                {
                  name: 'Google Books',
                  status: data?.providers.googleBooks.configured
                    ? `API key (${data.providers.googleBooks.mode})`
                    : 'Public quota',
                  tone: data?.providers.googleBooks.configured ? 'forest' : 'neutral',
                },
                {
                  name: 'Open Library',
                  status: 'Public API',
                  tone: 'forest',
                },
                {
                  name: 'Barcode / OCR',
                  status: data?.providers.ocr.enabled ? 'Enabled' : 'Disabled',
                  tone: data?.providers.ocr.enabled ? 'forest' : 'neutral',
                },
              ].map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-xl border border-line bg-white/40 px-3 py-2.5"
                >
                  <span className="text-sm text-ink">{item.name}</span>
                  <Badge tone={item.tone as 'forest' | 'neutral'}>{item.status}</Badge>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[0.65rem] leading-relaxed text-muted">
              OCR support depends on your server configuration. Add keys to your environment to
              increase quotas.
            </p>
          </section>

          <section className="card p-5">
            <div className="flex items-center gap-2">
              <Server size={16} className="text-gold-600" />
              <h2 className="font-display text-lg font-semibold text-ink">Metadata cache</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              {data?.cache.entries ?? 0} cached {data?.cache.entries === 1 ? 'entry' : 'entries'}
              {data?.cache.lastFetchedAt
                ? ` · last refreshed ${new Date(data.cache.lastFetchedAt).toLocaleDateString()}`
                : ''}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={handleClearCache}
              loading={clearing}
            >
              <RefreshCw size={13} />
              Clear metadata cache
            </Button>
            <Alert tone="info" className="mt-3 text-xs">
              Clearing forces fresh lookups from Google Books and Open Library the next time they are
              requested.
            </Alert>
          </section>

          <section className="rounded-2xl border border-forest-800/20 bg-gradient-to-b from-forest-900 to-forest-950 p-5 text-parchment">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-gold-300" />
              <h2 className="font-display text-lg font-semibold">About</h2>
            </div>
            <p className="mt-1 text-xs text-parchment/60">
              Bibliotheca · Every book. One library.
            </p>
            <p className="mt-2 text-[0.62rem] uppercase tracking-[0.16em] text-parchment/35">
              MySQL · Express · React · Vite
            </p>
          </section>
        </aside>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
