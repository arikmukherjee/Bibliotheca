import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FolderHeart, Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { CollectionWithCount } from '../lib/types';
import { cn, errorMessage } from '../lib/utils';
import { useCollections } from '../lib/queries';
import { useToast } from '../components/Toast';
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  Textarea,
} from '../components/ui';

const PALETTE = [
  '#2C5D48',
  '#B8893B',
  '#7C5427',
  '#5F917A',
  '#9A6D2F',
  '#3F735C',
  '#654525',
  '#8FB4A0',
];

function CollectionDialog({
  open,
  onClose,
  collection = null,
}: {
  open: boolean;
  onClose: () => void;
  collection?: CollectionWithCount | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [color, setColor] = useState(collection?.color ?? PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setName(collection?.name ?? '');
    setDescription(collection?.description ?? '');
    setColor(collection?.color ?? PALETTE[0]);
    setError('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('A collection name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (collection) {
        await api.updateCollection(collection.id, {
          name: name.trim(),
          description: description.trim() || null,
          color,
        });
        toast.success('Collection updated.');
      } else {
        await api.createCollection({
          name: name.trim(),
          description: description.trim() || null,
          color,
        });
        toast.success('Collection created.');
      }
      await queryClient.invalidateQueries();
      onClose();
      reset();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title={collection ? 'Edit collection' : 'Create collection'}
      description="Group books and copies by theme, location or mood."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
              reset();
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {collection ? 'Save changes' : 'Create collection'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Name" htmlFor="collection-name" required>
          <Input
            id="collection-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Classics, Fantasy, To lend…"
          />
        </Field>
        <Field label="Description" htmlFor="collection-desc">
          <Textarea
            id="collection-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional notes about this collection"
            className="min-h-20"
          />
        </Field>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Colour</p>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                className={cn(
                  'h-8 w-8 rounded-full ring-offset-2 ring-offset-ivory transition',
                  color === swatch ? 'ring-2 ring-forest-400' : 'hover:ring-2 hover:ring-line',
                )}
                style={{ backgroundColor: swatch }}
                aria-label={`Colour ${swatch}`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-8 w-8 cursor-pointer rounded-full border border-line bg-transparent"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function CollectionsPage() {
  const collections = useCollections();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<CollectionWithCount | null>(null);
  const [toDelete, setToDelete] = useState<CollectionWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const result = await api.deleteCollection(toDelete.id);
      await queryClient.invalidateQueries();
      toast.success(
        result.itemsUncategorized > 0
          ? `Collection deleted. ${result.itemsUncategorized} copies are now uncategorised.`
          : 'Collection deleted.',
      );
      setToDelete(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Organise"
        title="Collections"
        description="Curate groups of books and track them at a glance."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Create collection
          </Button>
        }
      />

      {collections.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : collections.isError ? (
        <Alert tone="danger" title="Collections could not be loaded">
          <div className="flex flex-wrap items-center gap-3">
            <span>{errorMessage(collections.error)}</span>
            <Button size="sm" variant="secondary" onClick={() => void collections.refetch()}>
              Try again
            </Button>
          </div>
        </Alert>
      ) : collections.data && collections.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {collections.data.map((collection) => (
            <article key={collection.id} className="card p-4 transition hover:border-forest-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-3 w-3 rounded-full ring-4 ring-white"
                    style={{ backgroundColor: collection.color }}
                  />
                  <h2 className="font-display text-lg font-semibold text-ink">{collection.name}</h2>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(collection)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-red-50"
                    onClick={() => setToDelete(collection)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {collection.description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                  {collection.description}
                </p>
              ) : null}
              <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs text-muted">
                <span>
                  {collection.bookCount} {collection.bookCount === 1 ? 'edition' : 'editions'} ·{' '}
                  {collection.itemCount} {collection.itemCount === 1 ? 'copy' : 'copies'}
                </span>
                <Link
                  to={`/catalog?collectionId=${collection.id}`}
                  className="font-medium text-forest-700 hover:underline"
                >
                  Browse
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderHeart size={18} />}
          title="No collections yet"
          description="Create a collection to group books by theme, location, gift sets or anything you like."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={15} />
              Create first collection
            </Button>
          }
          className="py-16"
        />
      )}

      <CollectionDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <CollectionDialog
        key={edit?.id ?? 'edit'}
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        collection={edit}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete this collection?"
        description={
          <span>
            Copies in “{toDelete?.name}” will become uncategorised. The bibliographic records will
            remain unchanged.
          </span>
        }
        confirmLabel="Delete collection"
      />
    </div>
  );
}
