import { clsx, type ClassValue } from 'clsx';
import type { ItemFormat, ItemStatus, PhysicalCondition } from './types';

export function cn(...values: ClassValue[]): string {
  return clsx(values);
}

export function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dateOnly = new Date(`${value}T00:00:00`);
    return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseServerDate(value);
  if (!date) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parseServerDate(value);
  if (!date) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(value: string | null | undefined): string {
  const date = parseServerDate(value);
  if (!date) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [unit, unitSeconds] of ranges) {
    if (Math.abs(seconds) >= unitSeconds || unit === 'second') {
      return formatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return '';
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const STATUS_LABELS: Record<ItemStatus, string> = {
  owned: 'Owned',
  reading: 'Reading',
  loaned: 'Loaned',
  lost: 'Lost',
  sold: 'Sold',
  donated: 'Donated',
  wishlist: 'Wishlist',
};

export const STATUS_STYLES: Record<ItemStatus, string> = {
  owned: 'bg-forest-50 text-forest-700 border-forest-200',
  reading: 'bg-gold-50 text-gold-700 border-gold-200',
  loaned: 'bg-amber-50 text-amber-700 border-amber-200',
  lost: 'bg-red-50 text-danger border-red-200',
  sold: 'bg-stone-100 text-stone-600 border-stone-200',
  donated: 'bg-sky-50 text-sky-700 border-sky-200',
  wishlist: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const CONDITION_LABELS: Record<PhysicalCondition, string> = {
  new: 'New',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export const FORMAT_LABELS: Record<ItemFormat, string> = {
  physical: 'Physical',
  digital: 'Digital',
};

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as Array<[ItemStatus, string]>;
export const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS) as Array<
  [PhysicalCondition, string]
>;
export const FORMAT_OPTIONS = Object.entries(FORMAT_LABELS) as Array<[ItemFormat, string]>;

export const SORT_OPTIONS = [
  { value: 'dateAdded', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'publicationDate', label: 'Publication year' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'itemId', label: 'Item code' },
  { value: 'accessionNumber', label: 'Accession number' },
] as const;

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function coverGradient(title: string): string {
  const palettes = [
    'from-forest-800 via-forest-700 to-forest-900',
    'from-gold-600 via-gold-500 to-gold-700',
    'from-stone-700 via-stone-600 to-stone-800',
    'from-forest-600 via-forest-500 to-forest-800',
    'from-amber-700 via-amber-600 to-amber-800',
    'from-slate-700 via-slate-600 to-slate-800',
  ];
  let hash = 0;
  for (const character of title) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palettes[hash % palettes.length] ?? palettes[0]!;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[;|]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export function splitTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[;,|]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export function toOptionalNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function statusLabel(value: string): string {
  return STATUS_LABELS[value as ItemStatus] ?? value;
}

export function statusStyle(value: string): string {
  return STATUS_STYLES[value as ItemStatus] ?? 'border-line bg-white/60 text-muted';
}

export function conditionLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CONDITION_LABELS[value as PhysicalCondition] ?? value;
}

export function formatLabel(value: string): string {
  return FORMAT_LABELS[value as ItemFormat] ?? value;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

export function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
