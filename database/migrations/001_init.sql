-- Bibliotheca schema v1
-- MySQL 8.0+ / MariaDB 10.6+
-- All identifiers are stored as strings. ISBNs are edition identifiers, never primary keys.

CREATE TABLE IF NOT EXISTS books (
  id CHAR(26) NOT NULL,
  title VARCHAR(500) NOT NULL,
  subtitle VARCHAR(500) NULL,
  publisher VARCHAR(255) NULL,
  publication_date VARCHAR(64) NULL,
  publication_year SMALLINT NULL,
  edition VARCHAR(128) NULL,
  language VARCHAR(64) NULL,
  page_count INT NULL,
  description TEXT NULL,
  table_of_contents MEDIUMTEXT NULL,
  series_title VARCHAR(255) NULL,
  series_volume VARCHAR(64) NULL,
  isbn10 CHAR(10) NULL,
  isbn13 CHAR(13) NULL,
  cover_image_url VARCHAR(1024) NULL,
  cover_image_source VARCHAR(64) NULL,
  metadata_source VARCHAR(64) NULL,
  external_reference VARCHAR(255) NULL,
  external_url VARCHAR(1024) NULL,
  original_publication_date VARCHAR(64) NULL,
  field_sources JSON NULL,
  metadata_retrieved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_books_isbn13 (isbn13),
  UNIQUE KEY uq_books_isbn10 (isbn10),
  KEY idx_books_title (title),
  KEY idx_books_publisher (publisher),
  KEY idx_books_publication_year (publication_year),
  KEY idx_books_created_at (created_at),
  KEY idx_books_external (external_reference),
  CONSTRAINT chk_books_page_count CHECK (page_count IS NULL OR page_count >= 0),
  CONSTRAINT chk_books_year CHECK (publication_year IS NULL OR (publication_year >= 1000 AND publication_year <= 2200))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_authors_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_authors (
  book_id CHAR(26) NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, author_id),
  KEY idx_book_authors_author (author_id),
  CONSTRAINT fk_book_authors_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
  CONSTRAINT fk_book_authors_author FOREIGN KEY (author_id) REFERENCES authors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subjects_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_subjects (
  book_id CHAR(26) NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (book_id, subject_id),
  KEY idx_book_subjects_subject (subject_id),
  CONSTRAINT fk_book_subjects_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
  CONSTRAINT fk_book_subjects_subject FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_tags (
  book_id CHAR(26) NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (book_id, tag_id),
  KEY idx_book_tags_tag (tag_id),
  CONSTRAINT fk_book_tags_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE,
  CONSTRAINT fk_book_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collections (
  id CHAR(26) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#2C5D48',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_collections_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_items (
  id CHAR(26) NOT NULL,
  book_id CHAR(26) NOT NULL,
  item_code VARCHAR(32) NOT NULL,
  accession_number VARCHAR(128) NULL,
  acquisition_date DATE NULL,
  acquisition_source VARCHAR(255) NULL,
  purchase_price DECIMAL(12, 2) NULL,
  currency CHAR(3) NULL,
  shelf_location VARCHAR(128) NULL,
  collection_id CHAR(26) NULL,
  physical_condition ENUM('new', 'like_new', 'very_good', 'good', 'fair', 'poor') NULL,
  format ENUM('physical', 'digital') NOT NULL DEFAULT 'physical',
  item_status ENUM('owned', 'reading', 'loaned', 'lost', 'sold', 'donated', 'wishlist') NOT NULL DEFAULT 'owned',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalog_item_code (item_code),
  UNIQUE KEY uq_catalog_accession (accession_number),
  KEY idx_catalog_book (book_id),
  KEY idx_catalog_collection (collection_id),
  KEY idx_catalog_created (created_at),
  KEY idx_catalog_format (format),
  KEY idx_catalog_status (item_status),
  KEY idx_catalog_condition (physical_condition),
  KEY idx_catalog_shelf (shelf_location),
  CONSTRAINT fk_catalog_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE RESTRICT,
  CONSTRAINT fk_catalog_collection FOREIGN KEY (collection_id) REFERENCES collections (id) ON DELETE SET NULL,
  CONSTRAINT chk_catalog_price CHECK (purchase_price IS NULL OR purchase_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_tags (
  item_id CHAR(26) NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (item_id, tag_id),
  KEY idx_item_tags_tag (tag_id),
  CONSTRAINT fk_item_tags_item FOREIGN KEY (item_id) REFERENCES catalog_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_item_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) NOT NULL,
  setting_value TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS metadata_lookup_cache (
  cache_key VARCHAR(255) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  payload LONGTEXT NOT NULL,
  fetched_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (cache_key),
  KEY idx_metadata_cache_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  action VARCHAR(48) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id CHAR(26) NULL,
  summary VARCHAR(255) NOT NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_jobs (
  id CHAR(26) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(16) NOT NULL,
  headers JSON NOT NULL,
  rows_json MEDIUMTEXT NOT NULL,
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_import_jobs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (setting_key, setting_value) VALUES
  ('library_name', 'My Library'),
  ('default_currency', 'USD'),
  ('default_format', 'physical'),
  ('default_condition', 'good');
