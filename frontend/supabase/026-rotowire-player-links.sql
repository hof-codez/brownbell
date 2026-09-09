-- 026-rotowire-player-links.sql
-- Maps a Sleeper player to their RotoWire profile URL - discovered
-- opportunistically whenever that player appears in RotoWire's shared,
-- league-wide news feed (which already includes a <link> to their profile
-- page on every item). Once known, the automation can fetch that
-- player's own profile page directly for a much deeper news history than
-- the shared feed's small rolling window ever shows - see
-- fetchAndSaveProfileNews in update-standings.js.
--
-- This only ever grows (a player is never un-discovered) and is
-- deliberately NOT tied to a season - a player's RotoWire URL doesn't
-- change year to year.
--
-- Run in the Supabase SQL Editor after 025-player-news.sql.

create table rotowire_player_links (
    sleeper_player_id text primary key,
    rotowire_url text not null,
    discovered_at timestamptz not null default now()
);

alter table rotowire_player_links enable row level security;
create policy "public read" on rotowire_player_links for select using (true);
