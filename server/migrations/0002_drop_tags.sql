-- Drop the tag system entirely. Free-form tag chips never made it into the
-- final UX, and keeping the tables (with their FK CASCADE on items) around
-- adds confusion to backups and the admin surface.
DROP TABLE IF EXISTS item_tags;
DROP TABLE IF EXISTS tags;
