import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify/sync';
import type { CatalogEntry } from '../../types/models.js';
import { listCatalogForExport } from '../catalog/itemRepository.js';
import { getAllSettings } from '../settings/settingsRepository.js';
import type { CatalogFilters } from '../../types/models.js';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'pdf';

export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

const STATUS_LABELS: Record<string, string> = {
  owned: 'Owned',
  reading: 'Reading',
  loaned: 'Loaned',
  lost: 'Lost',
  sold: 'Sold',
  donated: 'Donated',
  wishlist: 'Wishlist',
};

const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

interface ExportRow {
  title: string;
  subtitle: string;
  authors: string;
  isbn13: string;
  isbn10: string;
  publisher: string;
  publicationDate: string;
  publicationYear: string;
  edition: string;
  language: string;
  pages: string;
  series: string;
  seriesVolume: string;
  itemCode: string;
  accessionNumber: string;
  format: string;
  condition: string;
  status: string;
  collection: string;
  shelf: string;
  acquisitionDate: string;
  acquisitionSource: string;
  purchasePrice: string;
  currency: string;
  tags: string;
  notes: string;
  copies: string;
  added: string;
}

function toRow(entry: CatalogEntry): ExportRow {
  return {
    title: entry.book.title,
    subtitle: entry.book.subtitle ?? '',
    authors: entry.book.authors.join('; '),
    isbn13: entry.book.isbn13 ?? '',
    isbn10: entry.book.isbn10 ?? '',
    publisher: entry.book.publisher ?? '',
    publicationDate: entry.book.publicationDate ?? '',
    publicationYear: entry.book.publicationYear ? String(entry.book.publicationYear) : '',
    edition: entry.book.edition ?? '',
    language: entry.book.language ?? '',
    pages: entry.book.pageCount ? String(entry.book.pageCount) : '',
    series: entry.book.seriesTitle ?? '',
    seriesVolume: entry.book.seriesVolume ?? '',
    itemCode: entry.itemCode,
    accessionNumber: entry.accessionNumber ?? '',
    format: entry.format === 'digital' ? 'Digital' : 'Physical',
    condition: entry.physicalCondition
      ? (CONDITION_LABELS[entry.physicalCondition] ?? entry.physicalCondition)
      : '',
    status: STATUS_LABELS[entry.itemStatus] ?? entry.itemStatus,
    collection: entry.collection?.name ?? '',
    shelf: entry.shelfLocation ?? '',
    acquisitionDate: entry.acquisitionDate ?? '',
    acquisitionSource: entry.acquisitionSource ?? '',
    purchasePrice: entry.purchasePrice !== null ? entry.purchasePrice.toFixed(2) : '',
    currency: entry.currency ?? '',
    tags: entry.tags.join('; '),
    notes: entry.notes ?? '',
    copies: String(entry.copyCount),
    added: entry.createdAt,
  };
}

const COLUMNS: Array<{ key: keyof ExportRow; header: string; width: number }> = [
  { key: 'title', header: 'Title', width: 32 },
  { key: 'subtitle', header: 'Subtitle', width: 24 },
  { key: 'authors', header: 'Authors', width: 26 },
  { key: 'isbn13', header: 'ISBN-13', width: 16 },
  { key: 'isbn10', header: 'ISBN-10', width: 14 },
  { key: 'publisher', header: 'Publisher', width: 22 },
  { key: 'publicationDate', header: 'Publication date', width: 16 },
  { key: 'publicationYear', header: 'Year', width: 8 },
  { key: 'edition', header: 'Edition', width: 12 },
  { key: 'language', header: 'Language', width: 12 },
  { key: 'pages', header: 'Pages', width: 8 },
  { key: 'series', header: 'Series', width: 20 },
  { key: 'seriesVolume', header: 'Series volume', width: 12 },
  { key: 'itemCode', header: 'Item code', width: 12 },
  { key: 'accessionNumber', header: 'Accession number', width: 16 },
  { key: 'format', header: 'Format', width: 10 },
  { key: 'condition', header: 'Condition', width: 12 },
  { key: 'status', header: 'Status', width: 10 },
  { key: 'collection', header: 'Collection', width: 18 },
  { key: 'shelf', header: 'Shelf', width: 12 },
  { key: 'acquisitionDate', header: 'Acquired', width: 12 },
  { key: 'acquisitionSource', header: 'Acquisition source', width: 20 },
  { key: 'purchasePrice', header: 'Price', width: 10 },
  { key: 'currency', header: 'Currency', width: 8 },
  { key: 'tags', header: 'Tags', width: 20 },
  { key: 'notes', header: 'Notes', width: 30 },
  { key: 'copies', header: 'Copies of edition', width: 14 },
  { key: 'added', header: 'Added to library', width: 20 },
];

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function buildCsv(entries: CatalogEntry[]): Promise<ExportFile> {
  const csv = stringify(entries.map(toRow), {
    header: true,
    columns: COLUMNS.map((column) => ({ key: column.key, header: column.header })),
  });
  return {
    buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    extension: 'csv',
  };
}

async function buildXlsx(entries: CatalogEntry[], libraryName: string): Promise<ExportFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Bibliotheca';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Library', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  sheet.addRows(entries.map(toRow));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFCFAF4' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4A39' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLUMNS.length)}1` };
  sheet.properties.defaultRowHeight = 18;
  sheet.headerFooter.oddHeader = `&L${libraryName}&R${entries.length} entries`;
  sheet.headerFooter.oddFooter = '&CExported from Bibliotheca';
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  };
}

function buildJson(entries: CatalogEntry[], libraryName: string): ExportFile {
  const payload = {
    format: 'bibliotheca-library',
    version: 1,
    library: libraryName,
    exportedAt: new Date().toISOString(),
    count: entries.length,
    items: entries,
  };
  return {
    buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    contentType: 'application/json; charset=utf-8',
    extension: 'json',
  };
}

function buildPdf(entries: CatalogEntry[], libraryName: string): Promise<ExportFile> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 52, right: 48, bottom: 52, left: 48 },
      info: {
        Title: `${libraryName} — Library catalogue`,
        Author: 'Bibliotheca',
        Creator: 'Bibliotheca',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () =>
      resolve({
        buffer: Buffer.concat(chunks),
        contentType: 'application/pdf',
        extension: 'pdf',
      }),
    );
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1F4A39').text(libraryName);
    doc
      .moveDown(0.25)
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#66706A')
      .text(`Library catalogue · ${entries.length} item${entries.length === 1 ? '' : 's'} · Exported ${dateStamp()}`);
    doc.moveDown(0.8);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.margins.left + pageWidth, doc.y)
      .strokeColor('#D2A44B')
      .lineWidth(1.5)
      .stroke();
    doc.moveDown(1);

    entries.forEach((entry, index) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 90) {
        doc.addPage();
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#1B2621')
        .text(`${index + 1}. ${entry.book.title}`, { width: pageWidth });
      if (entry.book.subtitle) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#4A554F').text(entry.book.subtitle);
      }
      const details: string[] = [];
      if (entry.book.authors.length) details.push(entry.book.authors.join('; '));
      if (entry.book.publisher) details.push(entry.book.publisher);
      if (entry.book.publicationYear) details.push(String(entry.book.publicationYear));
      if (entry.book.isbn13) details.push(`ISBN ${entry.book.isbn13}`);
      if (details.length) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#66706A').text(details.join(' · '));
      }
      const location: string[] = [];
      location.push(entry.format === 'digital' ? 'Digital' : 'Physical');
      if (entry.collection) location.push(entry.collection.name);
      if (entry.shelfLocation) location.push(`Shelf ${entry.shelfLocation}`);
      if (entry.itemCode) location.push(entry.itemCode);
      if (entry.copyCount > 1) location.push(`${entry.copyCount} copies`);
      doc.font('Helvetica').fontSize(9).fillColor('#8A928D').text(location.join(' · '));
      doc.moveDown(0.75);
      if (index < entries.length - 1) {
        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.margins.left + pageWidth, doc.y)
          .strokeColor('#E4DDCC')
          .lineWidth(0.6)
          .stroke();
        doc.moveDown(0.75);
      }
    });

    if (entries.length === 0) {
      doc.font('Helvetica').fontSize(12).fillColor('#66706A').text('The catalogue is empty.');
    }

    doc.end();
  });
}

export async function generateExport(
  format: ExportFormat,
  filters: CatalogFilters,
  selectedIds?: string[],
): Promise<ExportFile> {
  const entries = await listCatalogForExport(filters, selectedIds);
  const settings = await getAllSettings();
  const libraryName = settings.library_name || 'My Library';

  switch (format) {
    case 'xlsx':
      return buildXlsx(entries, libraryName);
    case 'json':
      return buildJson(entries, libraryName);
    case 'pdf':
      return buildPdf(entries, libraryName);
    case 'csv':
    default:
      return buildCsv(entries);
  }
}

export function exportFileName(extension: string): string {
  return `bibliotheca-library-${dateStamp()}.${extension}`;
}
