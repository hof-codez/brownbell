-- 023-nfl-schedule.sql
-- Stores each NFL team's game info per week - opponent, kickoff time, bye
-- status - so the frontend can show "next game, opponent, kickoff time"
-- next to each player's name without ever calling an external API
-- directly. Written by the Node automation (which already fetches this
-- from ESPN's public scoreboard every run - see fetchNFLSchedule/
-- parseEspnSchedule in update-standings.js), read-only from the frontend,
-- matching how every other piece of external data flows into this app.
--
-- One row per NFL team per week - upserted on every automation run, so
-- this always reflects the latest known schedule (flex moves, weather
-- reschedules, etc) without any separate sync step.
--
-- Run in the Supabase SQL Editor after 022-per-award-permanent-swaps.sql.

create table nfl_schedule (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references seasons(id) on delete cascade,
    week int not null check (week between 1 and 18),
    nfl_team text not null,
    opponent_nfl_team text,
    kickoff_time timestamptz,
    is_bye boolean not null default false,
    updated_at timestamptz not null default now(),
    unique (season_id, week, nfl_team)
);

create index idx_nfl_schedule_week on nfl_schedule (season_id, week);

alter table nfl_schedule enable row level security;
create policy "public read" on nfl_schedule for select using (true);
