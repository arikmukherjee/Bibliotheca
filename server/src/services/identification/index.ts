import { config } from '../../config.js';
import { decodeBarcodes } from './barcode.js';
import { recognizeText, type OcrResult } from './ocr.js';
import { extractCoverTextHints } from './extract.js';
import {
  normalizeIsbn,
  extractIsbnsFromText,
  isbnReasonMessage,
  type IsbnCandidate,
  type IsbnReason,
} from '../../utils/isbn.js';
import { lookupByIsbn, searchBooks } from '../metadata/index.js';
import type { CandidateMatch } from '../metadata/types.js';

export interface ExtractedIsbn {
  raw: string;
  isbn10: string | null;
  isbn13: string | null;
  valid: boolean;
  reason: IsbnReason;
  source: 'barcode' | 'text';
  labelled: boolean;
}

export interface ImageIdentificationResult {
  extraction: {
    barcodeValues: string[];
    ocr: {
      available: boolean;
      confidence: number | null;
      textPreview: string;
      isbnCount: number;
    };
    extractedIsbns: ExtractedIsbn[];
    hints: {
      title: string | null;
      author: string | null;
      publisher: string | null;
      year: number | null;
      lineCount: number;
    };
  };
  candidates: CandidateMatch[];
  warnings: string[];
  notes: string[];
  searchMode: 'isbn' | 'title' | 'none';
  usedIsbn: string | null;
}

interface ImageIdentificationInput {
  buffer: Buffer;
  originalName?: string;
}

function candidateKey(candidate: ExtractedIsbn): string {
  return candidate.isbn13 ?? candidate.isbn10 ?? candidate.raw;
}

function fromBarcode(value: string): ExtractedIsbn | null {
  const normalized = normalizeIsbn(value);
  if (!normalized.isbn10 && !normalized.isbn13) return null;
  return {
    raw: value,
    isbn10: normalized.isbn10,
    isbn13: normalized.isbn13,
    valid: normalized.valid,
    reason: normalized.reason,
    source: 'barcode',
    labelled: true,
  };
}

function fromText(candidate: IsbnCandidate): ExtractedIsbn {
  return {
    raw: candidate.raw,
    isbn10: candidate.isbn10,
    isbn13: candidate.isbn13,
    valid: candidate.valid,
    reason: candidate.reason,
    source: 'text',
    labelled: candidate.labelled,
  };
}

function dedupeExtracted(values: ExtractedIsbn[]): ExtractedIsbn[] {
  const seen = new Set<string>();
  const result: ExtractedIsbn[] = [];
  for (const value of values) {
    const key = candidateKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function sortExtracted(values: ExtractedIsbn[]): ExtractedIsbn[] {
  return [...values].sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (a.source !== b.source) return a.source === 'barcode' ? -1 : 1;
    if (a.labelled !== b.labelled) return a.labelled ? -1 : 1;
    return 0;
  });
}

function emptyOcr(warning: string): OcrResult {
  return { text: '', confidence: null, available: false, warning };
}

export async function identifyBookFromImage(
  input: ImageIdentificationInput,
): Promise<ImageIdentificationResult> {
  const warnings: string[] = [];
  const notes: string[] = [];

  const barcodePromise = decodeBarcodes(input.buffer).catch((error: unknown) => {
    warnings.push(
      `Barcode decoding failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return { values: [] as string[], attemptedRotations: [] as number[] };
  });

  const ocrPromise = config.ocrEnabled
    ? recognizeText(input.buffer)
    : Promise.resolve(emptyOcr('Text recognition is disabled in the server configuration.'));

  const [barcodeResult, ocr] = await Promise.all([barcodePromise, ocrPromise]);

  if (!config.ocrEnabled) {
    notes.push('Text recognition is disabled. Barcode decoding is still available.');
  } else if (ocr.warning) {
    notes.push(ocr.warning);
  }

  const barcodeIsbns = barcodeResult.values
    .map(fromBarcode)
    .filter((value): value is ExtractedIsbn => Boolean(value));

  const textIsbns = extractIsbnsFromText(ocr.text).map(fromText);
  const extractedIsbns = sortExtracted(dedupeExtracted([...barcodeIsbns, ...textIsbns]));
  const validIsbns = extractedIsbns.filter((value) => value.valid);

  if (barcodeResult.values.length === 0) {
    notes.push('No barcode was detected in the image.');
  } else {
    notes.push(
      `Decoded ${barcodeResult.values.length} barcode${barcodeResult.values.length === 1 ? '' : 's'}.`,
    );
  }

  if (validIsbns.length > 1) {
    notes.push(
      `Multiple valid ISBNs were found. Bibliotheca will try the most likely one first; use the ISBN search to try another.`,
    );
  }

  const invalidTextIsbns = textIsbns.filter((value) => !value.valid && value.labelled);
  for (const invalid of invalidTextIsbns.slice(0, 2)) {
    warnings.push(
      `Found an ISBN-like number (${invalid.raw}) but ${isbnReasonMessage(invalid.reason).toLowerCase()}`,
    );
  }

  const hints = extractCoverTextHints(ocr.text);
  if (!hints.titleGuess && hints.lineCount > 0 && validIsbns.length === 0) {
    notes.push('The text on the image was too unclear to suggest a title.');
  }

  let candidates: CandidateMatch[] = [];
  let searchMode: 'isbn' | 'title' | 'none' = 'none';
  let usedIsbn: string | null = null;

  const isbnsToTry = validIsbns.slice(0, 2);
  for (const isbn of isbnsToTry) {
    const value = isbn.isbn13 ?? isbn.isbn10;
    if (!value) continue;
    try {
      const lookup = await lookupByIsbn(value, {
        title: hints.titleGuess,
        author: hints.authorGuess,
      });
      warnings.push(...lookup.warnings);
      if (lookup.candidates.length > 0) {
        candidates = lookup.candidates;
        searchMode = 'isbn';
        usedIsbn = value;
        break;
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : 'The ISBN metadata lookup failed unexpectedly.',
      );
    }
  }

  if (candidates.length === 0 && hints.titleGuess) {
    try {
      const lookup = await searchBooks({
        title: hints.titleGuess,
        author: hints.authorGuess,
      });
      warnings.push(...lookup.warnings);
      if (lookup.candidates.length > 0) {
        candidates = lookup.candidates;
        searchMode = 'title';
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : 'The cover-text metadata search failed.',
      );
    }
  }

  if (candidates.length === 0) {
    if (validIsbns.length === 0 && !hints.titleGuess) {
      warnings.push(
        'The image did not contain a readable ISBN or enough clear text to identify a book. You can retake the photo or enter the book manually.',
      );
    } else {
      warnings.push(
        'No confident matches were found. Try another photo, search by ISBN, or enter the book manually.',
      );
    }
  }

  if (searchMode === 'isbn' && hints.titleGuess) {
    notes.push('The ISBN was used as the primary identifier; cover text helped check the match.');
  } else if (searchMode === 'title') {
    notes.push('No ISBN was usable, so Bibliotheca searched using text found on the image.');
  }

  return {
    extraction: {
      barcodeValues: barcodeResult.values,
      ocr: {
        available: ocr.available,
        confidence: ocr.confidence,
        textPreview: hints.textPreview,
        isbnCount: textIsbns.length,
      },
      extractedIsbns,
      hints: {
        title: hints.titleGuess,
        author: hints.authorGuess,
        publisher: hints.publisherGuess,
        year: hints.yearGuess,
        lineCount: hints.lineCount,
      },
    },
    candidates,
    warnings: [...new Set(warnings)],
    notes: [...new Set(notes)],
    searchMode,
    usedIsbn,
  };
}
