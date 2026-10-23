export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'in',
  'to',
  'for',
  'on',
  'by',
  'with',
  'edition',
  'ed',
  'volume',
  'vol',
]);

function tokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const pairs = new Map<string, number>();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let intersection = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      intersection += 1;
      pairs.set(pair, count - 1);
    }
  }

  return (2 * intersection) / (a.length + b.length - 2);
}

export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const normalizedA = normalizeForMatch(a);
  const normalizedB = normalizeForMatch(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const aTokens = tokens(a);
  const bTokens = tokens(b);
  if (aTokens.length === 0 || bTokens.length === 0) return diceCoefficient(normalizedA, normalizedB);

  const tokenSetB = new Set(bTokens);
  const matches = aTokens.filter((token) => tokenSetB.has(token)).length;
  const jaccard = matches / new Set([...aTokens, ...bTokens]).size;
  const containment =
    normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)
      ? Math.min(normalizedA.length, normalizedB.length) / Math.max(normalizedA.length, normalizedB.length)
      : 0;
  const dice = diceCoefficient(normalizedA, normalizedB);

  return Math.min(1, Math.max(jaccard, containment * 0.92, dice));
}

export function bestAuthorSimilarity(
  candidateAuthors: string[],
  referenceAuthors: string[],
): number {
  if (candidateAuthors.length === 0 || referenceAuthors.length === 0) return 0;
  let best = 0;
  for (const candidate of candidateAuthors) {
    for (const reference of referenceAuthors) {
      best = Math.max(best, similarity(candidate, reference));
    }
  }
  return best;
}

export function splitList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : value.split(/[;,]/);
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

export function parseYear(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/\b(1\d{3}|2\d{3})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 2200 ? year : null;
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
