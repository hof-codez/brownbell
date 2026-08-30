-- 021-matchup-taunts.sql
-- Emoji taunts between weekly matchup opponents - a running log of recent
-- exchanges, persisting as part of that matchup's permanent record (no
-- expiry/cleanup). No time restrictions - can be sent before, during, or
-- after that week's games, unlike everything else timing-sensitive in this
-- app.
--
-- Run in the Supabase SQL Editor after 020-team-accent-color.sql.

create table matchup_taunts (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references seasons(id) on delete cascade,
    week int not null check (week between 1 and 14),
    sender_team_id uuid not null references teams(id) on delete cascade,
    recipient_team_id uuid not null references teams(id) on delete cascade,
    emoji text not null,
    created_at timestamptz not null default now()
);

create index idx_matchup_taunts_week on matchup_taunts (season_id, week);

alter table matchup_taunts enable row level security;
create policy "public read" on matchup_taunts for select using (true);
