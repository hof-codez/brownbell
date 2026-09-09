-- 025-player-news.sql
-- Stores short player-news snippets pulled from RotoWire's free public RSS
-- feed (https://www.rotowire.com/rss/news.php?sport=NFL) - the same
-- underlying source Sleeper, ESPN, and NFL.com themselves use for their
-- own player-news features. RotoWire's own terms permit third-party
-- display of this feed provided a link back to RotoWire.com is included -
-- see source_url below, which is always shown alongside the snippet.
--
-- Written by the Node automation on a periodic fetch (same pattern as
-- nfl_schedule); read-only from the frontend. Powers two features:
-- clicking a player's name to see their recent news, and the "My
-- Players" tab's feed for a claimed team's own 6 players.
--
-- sleeper_player_id is nullable - a RotoWire item whose player name
-- couldn't be confidently matched to a Sleeper player is still stored
-- (harmless, just never surfaced anywhere that requires a player match)
-- rather than silently dropped, so unmatched items remain inspectable.
--
-- Run in the Supabase SQL Editor after 024-duo-player-team.sql.

create table player_news (
    id uuid primary key default gen_random_uuid(),
    -- RotoWire's own item guid (e.g. 'nfl636384') - unique per news item,
    -- used to upsert without ever duplicating the same story across runs.
    rotowire_guid text not null unique,
    sleeper_player_id text,
    player_name text not null,
    headline text not null,
    snippet text not null,
    source_url text not null,
    published_at timestamptz not null,
    fetched_at timestamptz not null default now()
);

create index idx_player_news_sleeper_player on player_news (sleeper_player_id, published_at desc);

alter table player_news enable row level security;
create policy "public read" on player_news for select using (true);
