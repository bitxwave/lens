-- server/migrations/0001_init.sql
-- Initial (and only) schema baseline. Prior 0001-0005 that evolved
-- groups/items/tags → cards were squashed into this single migration
-- before first release; there is no production data to preserve
-- history for. Future schema changes go into 0002_*.sql etc.

PRAGMA foreign_keys = ON;

CREATE TABLE sites (
  id          INTEGER PRIMARY KEY,
  value       TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Polymorphic card entity — either a folder (top-level, has slug, no
-- icon) or an item (may live inside a folder, has icon, no slug). The
-- CHECK constraint enforces the folder-vs-item shape; a partial UNIQUE
-- index on (COALESCE(parent_id, -1), sort_order) works around SQLite
-- treating NULLs as distinct so root-level cards also have a unique
-- slot ordering.
CREATE TABLE cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('folder', 'item')),
  parent_id   INTEGER REFERENCES cards(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  slug        TEXT,
  icon_kind   TEXT    CHECK (icon_kind IS NULL OR icon_kind IN ('asset','url','auto-favicon')),
  icon_value  TEXT,
  description TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK (
    (kind = 'folder' AND parent_id IS NULL AND slug IS NOT NULL
        AND icon_kind IS NULL AND icon_value IS NULL AND description IS NULL)
    OR
    (kind = 'item' AND slug IS NULL
        AND icon_kind IS NOT NULL AND icon_value IS NOT NULL)
  )
);
CREATE UNIQUE INDEX cards_unique_slot ON cards(COALESCE(parent_id, -1), sort_order);
CREATE INDEX cards_parent_sort ON cards(parent_id, sort_order);

CREATE TABLE card_links (
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url     TEXT    NOT NULL,
  PRIMARY KEY (card_id, site_id)
);
CREATE INDEX idx_card_links_site ON card_links(site_id);

-- Session store — table name pinned by `SqliteStore::new(pool).with_table_name("tower_sessions")`
-- in auth/session.rs. tower-sessions-sqlx-store CAN auto-create this
-- table, but preferring an explicit migration keeps schema authority
-- inside this file (single source of truth for a fresh `db init`).
CREATE TABLE tower_sessions (
  id          TEXT PRIMARY KEY NOT NULL,
  data        BLOB NOT NULL,
  expiry_date INTEGER NOT NULL
);

INSERT INTO config (key, value) VALUES ('schema_version', '1');
