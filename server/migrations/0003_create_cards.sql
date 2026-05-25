-- Plan 6 / Launchpad unification.
-- Create the polymorphic `cards` table that subsumes both `groups` and
-- `items`. Legacy tables stay intact here; data movement happens in the
-- host-language `legacy_migrate.rs` step that runs immediately after this
-- file (id remapping needs a hashmap).
--
-- Note: the spec calls for `UNIQUE (parent_id, sort_order)`. SQLite
-- treats NULLs as distinct in UNIQUE constraints, which would let two
-- root cards share a sort_order. We use an expression-based unique
-- index with `COALESCE(parent_id, -1)` instead so the rule actually
-- enforces for top-level cards.

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
