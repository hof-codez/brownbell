-- 010-duo-names.sql
-- Optional custom nickname per team per award (Main and Next Up can each have
-- their own, independently). Public read so it displays for everyone; writes
-- only ever go through the set-duo-name Edge Function (device-token auth),
-- never directly via the anon key. Run in the Supabase SQL Editor after
-- 009-weekly-scores-bye-flag.sql.
--
-- Deliberately NOT auto-cleared when the underlying duo composition changes
-- (a swap, a permanent departure, etc.) - treated as the team's ongoing
-- identity for that award, not tied to one exact pair of players. The owner
-- can rename it anytime the same way they set it the first time.

create table duo_names (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    award_type text not null check (award_type in ('main', 'nextup')),
    name text not null check (char_length(name) between 1 and 40),
    updated_at timestamptz not null default now(),
    unique (team_id, award_type)
);

alter table duo_names enable row level security;

create policy "Public can view duo names"
    on duo_names for select
    using (true);
