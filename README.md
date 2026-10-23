# Bibliotheca

Bibliotheca is a full-stack personal library catalogue built with a MySQL database, an Express/TypeScript API, and a polished React + Vite client. It covers books, copies, collections, metadata lookup, ISBN/photo identification, import/export, statistics, and settings.

## Features

- **Catalogue management**: Add editions and track individual copies with status, condition, location, collection, tags, and acquisition details.
- **Smart metadata lookup**: Search by title/author or look up by ISBN. Results can be pulled from Google Books and Open Library with metadata caching.
- **Identification**: Identify books by cover photo (OCR/vision) or by scanning/barcode lookup.
- **Collections**: Organize copies into collections and browse by collection.
- **Import & export**: Import CSV/XLSX with preview and mapping (`add_copy` or `skip` on duplicates). Export as CSV, XLSX, JSON, or PDF.
- **Dashboard & stats**: Library totals, completeness, missing metadata/covers, collections, and recent activity.
- **Local-first UX**: Designed with a parchment/forest/gold palette, Fraunces + Inter, and responsive layouts.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Monorepo | npm workspaces (`server`, `client`) |
| Backend | Node.js 20+, Express, TypeScript, MySQL 8 / MariaDB, Zod, Multer, Sharp, Tesseract.js, `@zxing/library`, PDFKit, ExcelJS |
| Frontend | React 18, Vite, TypeScript, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS, Lucide React |

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [MySQL 8](https://dev.mysql.com/) or [MariaDB](https://mariadb.org/) (local instance on `127.0.0.1:3308` is supported via the bundled script)

## Quick Start (development)

```bash
# Install dependencies
npm install

# Start local MySQL (Windows script bundled)
npm run db:local:start

# Initialize schema
npm run db:local:init

# Run migrations
npm run db:migrate

# Start API + client concurrently
npm run dev
```

- Client: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:4000](http://localhost:4000)
- Health: [http://localhost:4000/api/health](http://localhost:4000/api/health)

## Environment Configuration

Copy `.env.example` to `.env` and adjust values as needed:

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s), comma-separated |
| `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` | `127.0.0.1`/`3308`/`root`/``/`bibliotheca` | MySQL connection |
| `DB_CONNECTION_LIMIT` | `10` | Pool size |
| `GOOGLE_BOOKS_API_KEY` | (empty) | Optional; uses public quota if unset |
| `METADATA_CACHE_TTL_HOURS` | `168` | Cache lifetime for metadata results |
| `METADATA_TIMEOUT_MS` | `9000` | Request timeout for metadata lookups |
| `OCR_ENABLED` | `true` | Enable cover/photo identification |
| `MAX_UPLOAD_MB` | `12` | Max upload size (covers/imports) |
| `UPLOAD_DIR` | `storage` | Upload directory (relative to `server/`) |
| `IDENTIFY_RATE_LIMIT` | `15` | Requests/min for identification endpoints |
| `EXPORT_RATE_LIMIT` | `30` | Requests/min for export endpoint |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run server (tsx watch) and client (vite) in parallel |
| `npm run build` | Build server and client |
| `npm start` | Start production API server (`server/dist/index.js`) |
| `npm run typecheck` | Typecheck server and client |
| `npm test` | Run server tests (Vitest) |
| `npm run db:migrate` | Run database migrations |
| `npm run db:local:init` | Initialize local MySQL instance (Windows PowerShell script) |
| `npm run db:local:start` | Start local MySQL instance |
| `npm run db:local:stop` | Stop local MySQL instance |
| `npm run db:local:status` | Check local MySQL status |

## Production Run

```bash
npm run build
npm start
```

In production, the API serves the built client from `client/dist` (SPA fallback enabled). Open [http://localhost:4000](http://localhost:4000).

## Project Structure

```
.
├── client/           # React + Vite frontend
├── server/           # Express + TypeScript API
├── database/
│   └── migrations/   # SQL migrations (001_init.sql)
├── scripts/          # Local DB helpers (Windows PowerShell)
└── storage/          # Uploaded files (covers, temp, etc.)
```

## API Notes

- Response envelope: lists `{ data, pagination }`, single resources `{ data }`, search/identify `{ data, warnings }`, errors `{ error: { code, message, details } }`
- Export: use `fileFormat` (`csv` \| `xlsx` \| `json` \| `pdf`), not `format`
- Catalog search matches title, authors, ISBN, publisher, series, subjects, tags, collection, item code, and accession number
- Stats treat "missing metadata" as: no ISBNs OR publisher null OR publication date null OR no authors

## License

Private project.
