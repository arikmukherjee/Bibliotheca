import { describe, expect, it } from 'vitest';
import {
  cleanIsbn,
  extractIsbnsFromText,
  isbn10To13,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
} from './isbn.js';

describe('ISBN helpers', () => {
  it('cleans formatting and ISBN prefixes', () => {
    expect(cleanIsbn('ISBN-13: 978-0-547-77374-2')).toBe('9780547773742');
  });

  it('validates ISBN-10 and ISBN-13 check digits', () => {
    expect(isValidIsbn10('0-547-77374-9')).toBe(true);
    expect(isValidIsbn13('978-0-547-77374-2')).toBe(true);
    expect(isValidIsbn13('9780547773743')).toBe(false);
  });

  it('converts a valid ISBN-10 to ISBN-13', () => {
    expect(isbn10To13('0547773749')).toBe('9780547773742');
  });

  it('normalizes both ISBN forms', () => {
    const from13 = normalizeIsbn('9780547773742');
    expect(from13.valid).toBe(true);
    expect(from13.isbn13).toBe('9780547773742');
    expect(from13.isbn10).toBe('0547773749');

    const from10 = normalizeIsbn('0547773749');
    expect(from10.valid).toBe(true);
    expect(from10.isbn13).toBe('9780547773742');
  });

  it('rejects invalid characters, bad checksums and invalid prefixes', () => {
    expect(normalizeIsbn('97805477737X2').reason).toBe('invalid_characters');
    expect(normalizeIsbn('9780547773743').reason).toBe('invalid_checksum');
    expect(normalizeIsbn('1234567890123').reason).toBe('invalid_prefix');
  });

  it('extracts labelled ISBNs from OCR-style text', () => {
    const candidates = extractIsbnsFromText(
      'A Wizard of Earthsea\nISBN 978-0-547-77374-2\nCopyright page',
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.isbn13).toBe('9780547773742');
    expect(candidates[0]?.labelled).toBe(true);
  });

  it('repairs common OCR character substitutions in labelled ISBNs', () => {
    const candidates = extractIsbnsFromText('ISBN 978-O-547-77374-2');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.isbn13).toBe('9780547773742');
    expect(candidates[0]?.valid).toBe(true);
  });
});
