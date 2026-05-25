-- Plan 6 / Launchpad unification.
-- Drop the only user-facing i18n column that still exists on a live table.
-- The other *_i18n columns lived on `groups` / `items`, both of which are
-- already dropped by `legacy_migrate.rs` before this file runs.
ALTER TABLE sites DROP COLUMN name_i18n;
