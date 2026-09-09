-- 028-player-news-source-name.sql
-- Adds a dedicated source attribution field to player_news, separate from
-- the RotoWire-specific "snippet" (a factual blurb, only present for
-- RotoWire-sourced items). Google News-sourced items have no snippet at
-- all (headline + source only, by design - see fetchAndSaveGoogleNews in
-- update-standings.js) and use this field instead so the frontend can
-- show the correct attribution ("Via Fox Sports", "Via Yahoo Sports",
-- etc.) rather than a hardcoded "Via RotoWire.com" that would be wrong
-- for a non-RotoWire item.
--
-- Run in the Supabase SQL Editor after 027-duo-player-departed.sql.

alter table player_news add column source_name text;
