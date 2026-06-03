-- Plan 6 cleanup, second wave.
--
-- The host-language migration in `services/legacy_migrate.rs` already
-- copies pre-cards data and drops the legacy tables on first boot of
-- a v0.1+ binary. That migration ran for every existing deployment
-- and is now removed in this commit.
--
-- This SQL migration is a belt-and-suspenders backstop: any DB that
-- somehow still has the legacy tables (manually restored backup,
-- never-booted-since-Plan-6 instance) gets them dropped here so the
-- schema converges with what the code expects. IF EXISTS keeps it a
-- no-op on all the deployments where `legacy_migrate.rs` already
-- handled the work.
DROP TABLE IF EXISTS item_links;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS groups;
