import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, MonitorSmartphone } from 'lucide-react';
import { api } from '../lib/api';
import type { CatalogEntry, ItemFormat, ItemStatus, PhysicalCondition } from '../lib/types';
import {
  CONDITION_OPTIONS,
  FORMAT_OPTIONS,
  STATUS_OPTIONS,
  cn,
  emptyToNull,
  errorMessage,
  splitTags,
  toOptionalNumber,
} from '../lib/utils';
import { useCollections, useSettings } from '../lib/queries';
import { useToast } from './Toast';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from './ui';

interface ItemFormState {
  format: ItemFormat;
  itemStatus: ItemStatus;
  physicalCondition: PhysicalCondition | '';
  collectionId: string;
  shelfLocation: string;
  accessionNumber: string;
  acquisitionDate: string;
  acquisitionSource: string;
  purchasePrice: string;
  currency: string;
  tags: string;
  notes: string;
}

const EMPTY: ItemFormState = {
  format: 'physical',
  itemStatus: 'owned',
  physicalCondition: 'good',
  collectionId: '',
  shelfLocation: '',
  accessionNumber: '',
  acquisitionDate: '',
  acquisitionSource: '',
  purchasePrice: '',
  currency: 'USD',
  tags: '',
  notes: '',
};

function fromItem(item: CatalogEntry): ItemFormState {
  return {
    format: item.format,
    itemStatus: item.itemStatus as ItemStatus,
    physicalCondition: (item.physicalCondition as PhysicalCondition | null) ?? '',
    collectionId: item.collectionId ?? '',
    shelfLocation: item.shelfLocation ?? '',
    accessionNumber: item.accessionNumber ?? '',
    acquisitionDate: item.acquisitionDate?.slice(0, 10) ?? '',
    acquisitionSource: item.acquisitionSource ?? '',
    purchasePrice: item.purchasePrice !== null ? String(item.purchasePrice) : '',
    currency: item.currency ?? '',
    tags: item.tags.join(', '),
    notes: item.notes ?? '',
  };
}

export function ItemDialog({
  open,
  onClose,
  bookId,
  bookTitle,
  item = null,
  initialCollectionId = '',
}: {
  open: boolean;
  onClose: () => void;
  bookId?: string;
  bookTitle?: string;
  item?: CatalogEntry | null;
  initialCollectionId?: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const collections = useCollections();
  const settings = useSettings();
  const [form, setForm] = useState<ItemFormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (item) {
      setForm(fromItem(item));
      return;
    }
    const settingsFormat = settings.data?.values.default_format === 'digital' ? 'digital' : 'physical';
    const condition = settings.data?.values.default_condition as PhysicalCondition | undefined;
    setForm({
      ...EMPTY,
      format: settingsFormat,
      physicalCondition: condition ?? 'good',
      currency: settings.data?.values.default_currency ?? 'USD',
      collectionId: initialCollectionId,
    });
  }, [open, item, initialCollectionId, settings.data]);

  const update = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!bookId) return;
    setSaving(true);
    setError('');
    const payload = {
      format: form.format,
      itemStatus: form.itemStatus,
      physicalCondition:
        form.format === 'digital' ? null : ((form.physicalCondition || null) as PhysicalCondition | null),
      collectionId: emptyToNull(form.collectionId),
      shelfLocation: emptyToNull(form.shelfLocation),
      accessionNumber: emptyToNull(form.accessionNumber),
      acquisitionDate: emptyToNull(form.acquisitionDate),
      acquisitionSource: emptyToNull(form.acquisitionSource),
      purchasePrice: toOptionalNumber(form.purchasePrice),
      currency: emptyToNull(form.currency)?.toUpperCase() ?? null,
      tags: splitTags(form.tags),
      notes: emptyToNull(form.notes),
    };

    try {
      if (item) {
        await api.updateCatalogItem(item.id, payload);
        toast.success(`Copy ${item.itemCode} updated.`);
      } else {
        await api.createBookItem(bookId, payload);
        toast.success('A new copy was added to this book.');
      }
      await queryClient.invalidateQueries();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit copy ${item.itemCode}` : 'Add a copy'}
      description={
        item
          ? bookTitle
          : `Catalog another physical or digital copy${bookTitle ? ` of “${bookTitle}”` : ''}.`
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {item ? 'Save changes' : 'Add copy'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Format</p>
          <div className="grid grid-cols-2 gap-2.5">
            {FORMAT_OPTIONS.map(([value, label]) => {
              const Icon = value === 'digital' ? MonitorSmartphone : BookOpen;
              const selected = form.format === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('format', value)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition',
                    selected
                      ? 'border-forest-400 bg-forest-50 text-forest-800 ring-2 ring-forest-100'
                      : 'border-line bg-white/50 text-muted hover:border-forest-200',
                  )}
                >
                  <Icon size={18} />
                  <span className="font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="item-status">
            <Select
              id="item-status"
              value={form.itemStatus}
              onChange={(event) => update('itemStatus', event.target.value as ItemStatus)}
            >
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Condition"
            htmlFor="item-condition"
            hint={form.format === 'digital' ? 'Not applicable to digital copies.' : undefined}
          >
            <Select
              id="item-condition"
              value={form.physicalCondition}
              disabled={form.format === 'digital'}
              onChange={(event) =>
                update('physicalCondition', event.target.value as PhysicalCondition | '')
              }
            >
              <option value="">Not recorded</option>
              {CONDITION_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Collection" htmlFor="item-collection">
            <Select
              id="item-collection"
              value={form.collectionId}
              onChange={(event) => update('collectionId', event.target.value)}
            >
              <option value="">No collection</option>
              {collections.data?.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Shelf location" htmlFor="item-shelf">
            <Input
              id="item-shelf"
              value={form.shelfLocation}
              onChange={(event) => update('shelfLocation', event.target.value)}
              placeholder="e.g. Living room · A3"
            />
          </Field>

          <Field label="Accession number" htmlFor="item-accession">
            <Input
              id="item-accession"
              value={form.accessionNumber}
              onChange={(event) => update('accessionNumber', event.target.value)}
              placeholder="Optional library number"
            />
          </Field>

          <Field label="Acquired on" htmlFor="item-acquired">
            <Input
              id="item-acquired"
              type="date"
              value={form.acquisitionDate}
              onChange={(event) => update('acquisitionDate', event.target.value)}
            />
          </Field>

          <Field label="Acquisition source" htmlFor="item-source">
            <Input
              id="item-source"
              value={form.acquisitionSource}
              onChange={(event) => update('acquisitionSource', event.target.value)}
              placeholder="Bookshop, gift, inherited…"
            />
          </Field>

          <div className="grid grid-cols-[1fr_6.5rem] gap-2">
            <Field label="Purchase price" htmlFor="item-price">
              <Input
                id="item-price"
                type="number"
                min="0"
                step="0.01"
                value={form.purchasePrice}
                onChange={(event) => update('purchasePrice', event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Currency" htmlFor="item-currency">
              <Input
                id="item-currency"
                value={form.currency}
                maxLength={3}
                onChange={(event) => update('currency', event.target.value.toUpperCase())}
                placeholder="USD"
                className="uppercase"
              />
            </Field>
          </div>
        </div>

        <Field label="Tags" htmlFor="item-tags" hint="Separate tags with commas.">
          <Input
            id="item-tags"
            value={form.tags}
            onChange={(event) => update('tags', event.target.value)}
            placeholder="signed, first edition, to read"
          />
        </Field>

        <Field label="Notes about this copy" htmlFor="item-notes">
          <Textarea
            id="item-notes"
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
            placeholder="Condition details, inscriptions, lending history…"
            className="min-h-20"
          />
        </Field>

        {item ? (
          <p className="text-[0.7rem] text-muted">
            Added {new Date(item.createdAt.replace(' ', 'T')).toLocaleDateString()} · item code{' '}
            <span className="font-mono">{item.itemCode}</span>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
