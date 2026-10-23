export type IsbnReason =
  | 'valid'
  | 'empty'
  | 'invalid_length'
  | 'invalid_characters'
  | 'invalid_checksum'
  | 'invalid_prefix';

export interface NormalizedIsbn {
  input: string;
  isbn10: string | null;
  isbn13: string | null;
  valid: boolean;
  reason: IsbnReason;
}

export interface IsbnCandidate extends NormalizedIsbn {
  raw: string;
  labelled: boolean;
  index: number;
  source: 'text' | 'barcode' | 'manual';
}

export function cleanIsbn(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^ISBN(?:-1[03])?\s*[:.]?\s*/i, '')
    .replace(/[\s-]/g, '')
    .trim();
}

function isbn10ChecksumValid(value: string): boolean {
  if (!/^\d{9}[\dX]$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const character = value[index];
    const digit = character === 'X' ? 10 : Number(character);
    sum += digit * (10 - index);
  }
  return sum % 11 === 0;
}

function isbn13ChecksumValid(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[12]);
}

export function isValidIsbn10(value: string): boolean {
  return isbn10ChecksumValid(cleanIsbn(value));
}

export function isValidIsbn13(value: string): boolean {
  const clean = cleanIsbn(value);
  return /^97[89]/.test(clean) && isbn13ChecksumValid(clean);
}

export function isbn10To13(value: string): string | null {
  const clean = cleanIsbn(value);
  if (!isbn10ChecksumValid(clean)) return null;
  const firstTwelve = `978${clean.slice(0, 9)}`;
  return `${firstTwelve}${isbn13CheckDigit(firstTwelve)}`;
}

export function isbn13To10(value: string): string | null {
  const clean = cleanIsbn(value);
  if (!isbn13ChecksumValid(clean) || !clean.startsWith('978')) return null;
  const firstNine = clean.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(firstNine[index]) * (10 - index);
  }
  const remainder = (11 - (sum % 11)) % 11;
  return `${firstNine}${remainder === 10 ? 'X' : remainder}`;
}

export function isbn13CheckDigit(firstTwelve: string): number {
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(firstTwelve[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeIsbn(raw: string): NormalizedIsbn {
  const input = raw.trim();
  const clean = cleanIsbn(input);

  if (!clean) {
    return { input, isbn10: null, isbn13: null, valid: false, reason: 'empty' };
  }

  if (clean.length === 10) {
    if (!/^[\dX]{10}$/.test(clean) || !/^\d{9}[\dX]$/.test(clean)) {
      return { input, isbn10: null, isbn13: null, valid: false, reason: 'invalid_characters' };
    }
    if (!isbn10ChecksumValid(clean)) {
      return { input, isbn10: null, isbn13: null, valid: false, reason: 'invalid_checksum' };
    }
    return {
      input,
      isbn10: clean,
      isbn13: isbn10To13(clean),
      valid: true,
      reason: 'valid',
    };
  }

  if (clean.length === 13) {
    if (!/^\d{13}$/.test(clean)) {
      return { input, isbn10: null, isbn13: null, valid: false, reason: 'invalid_characters' };
    }
    if (!/^97[89]/.test(clean)) {
      return { input, isbn10: null, isbn13: null, valid: false, reason: 'invalid_prefix' };
    }
    if (!isbn13ChecksumValid(clean)) {
      return { input, isbn10: null, isbn13: null, valid: false, reason: 'invalid_checksum' };
    }
    return {
      input,
      isbn10: isbn13To10(clean),
      isbn13: clean,
      valid: true,
      reason: 'valid',
    };
  }

  return {
    input,
    isbn10: null,
    isbn13: null,
    valid: false,
    reason: /[^0-9X]/i.test(clean) ? 'invalid_characters' : 'invalid_length',
  };
}

export function preferredIsbn(normalized: Pick<NormalizedIsbn, 'isbn10' | 'isbn13'>): string | null {
  return normalized.isbn13 ?? normalized.isbn10 ?? null;
}

function scanPattern(pattern: RegExp, text: string): Array<{ raw: string; index: number }> {
  const results: Array<{ raw: string; index: number }> = [];
  let match = pattern.exec(text);
  while (match !== null) {
    results.push({ raw: match[0], index: match.index });
    match = pattern.exec(text);
  }
  return results;
}

function isLabelled(text: string, index: number): boolean {
  const start = Math.max(0, index - 24);
  const prefix = text.slice(start, index);
  return /ISBN(?:-1[03])?\s*[:.#]?\s*$/i.test(prefix) || /ISBN/i.test(prefix);
}

function normalizeOcrDigits(raw: string): string {
  return raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');
}

export function extractIsbnsFromText(text: string): IsbnCandidate[] {
  if (!text) return [];
  const candidates: IsbnCandidate[] = [];
  const seen = new Set<string>();

  const add = (raw: string, index: number, labelled: boolean) => {
    const normalized = normalizeIsbn(raw);
    const key = normalized.isbn13 ?? normalized.isbn10 ?? cleanIsbn(raw);
    if (!key) return;
    if (!normalized.valid && !labelled) return;
    if (seen.has(key)) return;
    const trimmed = raw.trim();
    if (
      candidates.some(
        (candidate) => candidate.raw.includes(trimmed) || trimmed.includes(candidate.raw),
      )
    ) {
      return;
    }
    seen.add(key);
    candidates.push({
      ...normalized,
      raw: raw.trim(),
      labelled,
      index,
      source: 'text',
    });
  };

  for (const match of scanPattern(/\b97[89](?:[\s-]?\d){10}\b/g, text)) {
    add(match.raw, match.index, isLabelled(text, match.index));
  }

  for (const match of scanPattern(/\b(?:\d[\s-]?){9}[\dXx]\b/g, text)) {
    const labelled = isLabelled(text, match.index);
    add(match.raw, match.index, labelled);
  }

  const ocrLabelPattern = /ISBN(?:-1[03])?\s*[:.#]?\s*([0-9OoIlSsBbXx][0-9OoIlSsBbXx\s-]{7,22}[0-9Xx])/gi;
  let labelledMatch = ocrLabelPattern.exec(text);
  while (labelledMatch !== null) {
    const match = labelledMatch[1] ?? '';
    if (/[OoIlSsBb]/.test(match)) {
      const raw = normalizeOcrDigits(match);
      add(raw, labelledMatch.index, true);
    }
    labelledMatch = ocrLabelPattern.exec(text);
  }

  return candidates.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (a.labelled !== b.labelled) return a.labelled ? -1 : 1;
    return a.index - b.index;
  });
}

export function isbnReasonMessage(reason: IsbnReason): string {
  switch (reason) {
    case 'empty':
      return 'No ISBN was provided.';
    case 'invalid_length':
      return 'An ISBN must contain 10 or 13 digits.';
    case 'invalid_characters':
      return 'The ISBN contains characters that are not valid.';
    case 'invalid_checksum':
      return 'The ISBN check digit is invalid. The number may have been misread.';
    case 'invalid_prefix':
      return 'This 13-digit number is not an ISBN (it must begin with 978 or 979).';
    case 'valid':
      return 'Valid ISBN.';
  }
}

export function relatedIsbnValues(input: string): string[] {
  const normalized = normalizeIsbn(input);
  return [normalized.isbn10, normalized.isbn13].filter((value): value is string => Boolean(value));
}
