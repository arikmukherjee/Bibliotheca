import { describe, expect, it } from 'vitest';
import { buildCatalogWhere } from './itemRepository.js';

const base = {
  sort: 'dateAdded',
  order: 'desc' as const,
  page: 1,
  pageSize: 20,
};

describe('buildCatalogWhere', () => {
  it('searches text across bibliographic, tag, collection and copy fields', () => {
    const where = buildCatalogWhere({ ...base, q: 'hobbit' });

    expect(where.sql).toContain('b.title LIKE ?');
    expect(where.sql).toContain('a_q.name LIKE ?');
    expect(where.sql).toContain('t_q.name LIKE ?');
    expect(where.sql).toContain('c.name LIKE ?');
    expect(where.sql).toContain('ci.item_code LIKE ?');
    expect(where.sql).toContain('ci.accession_number LIKE ?');
    expect(where.params).toHaveLength(11);
    expect(where.params.every((param) => param === '%hobbit%')).toBe(true);
  });

  it('does not require an exact item code for a text search', () => {
    const where = buildCatalogWhere({ ...base, q: 'earthsea' });

    expect(where.sql).not.toMatch(/ci\.item_code = \?/);
    expect(where.sql).not.toMatch(/ci\.accession_number = \?/);
  });

  it('uses ISBN matching when the query is a valid ISBN', () => {
    const where = buildCatalogWhere({ ...base, q: '978-0-547-77374-2' });

    expect(where.sql).toContain('b.isbn13 = ?');
    expect(where.sql).toContain('b.isbn10 = ?');
    expect(where.sql).not.toContain('b.title LIKE ?');
    expect(where.params).toContain('9780547773742');
  });

  it('combines filters with AND while grouping text matches', () => {
    const where = buildCatalogWhere({
      ...base,
      q: 'fantasy',
      format: 'physical',
      status: 'owned',
    });

    expect(where.sql).toContain('ci.format = ?');
    expect(where.sql).toContain('ci.item_status = ?');
    expect(where.sql).toContain('b.title LIKE ?');
    expect(where.params).toContain('physical');
    expect(where.params).toContain('owned');
    expect(where.params).toContain('%fantasy%');
  });
});
