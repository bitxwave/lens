-- server/migrations/0001_init.sql

PRAGMA foreign_keys = ON;

CREATE TABLE sites (
  id          INTEGER PRIMARY KEY,
  value       TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  name_i18n   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE groups (
  id                INTEGER PRIMARY KEY,
  slug              TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL,
  name_i18n         TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  collapsed_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id               INTEGER PRIMARY KEY,
  group_id         INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL,
  name_i18n        TEXT,
  description      TEXT,
  description_i18n TEXT,
  icon_kind        TEXT    NOT NULL CHECK (icon_kind IN ('asset','url','auto-favicon')),
  icon_value       TEXT    NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE item_links (
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url         TEXT    NOT NULL,
  PRIMARY KEY (item_id, site_id)
);

CREATE TABLE tags (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  name_i18n   TEXT
);

CREATE TABLE item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_items_group_sort ON items(group_id, sort_order);
CREATE INDEX idx_item_links_site  ON item_links(site_id);
CREATE INDEX idx_item_tags_tag    ON item_tags(tag_id);

INSERT INTO config (key, value) VALUES ('schema_version', '1');

CREATE TABLE tower_sessions (
  id          TEXT PRIMARY KEY NOT NULL,
  data        BLOB NOT NULL,
  expiry_date INTEGER NOT NULL
);
