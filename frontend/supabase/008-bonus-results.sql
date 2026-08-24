-- 008-bonus-results.sql
-- Weekly Brown Bell (Main Award) head-to-head bonus matchups. A separate
-- round-robin schedule generated specifically for this mechanic - not tied
-- to the real Sleeper league's own matchups. Run in the Supabase SQL Editor
-- after 007-weekly-scores-player-info.sql.
--
-- One row per team per week (so a matchup between A and B produces 2 rows,
-- one from each team's perspective - both hold the same underlying result).
-- tier is 1 (best-scoring winner that week) through 6 (worst-scoring winner),
-- null if the team lost. On a tie, both teams get outcome='tie' and split
-- that tier's bonus_points evenly.

create table bonus_results (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    week int not null,
    opponent_team_id uuid references teams(id) on delete set null,
    team_score numeric not null default 0,
    opponent_score numeric not null default 0,
    outcome text not null check (outcome in ('win', 'loss', 'tie')),
    tier int check (tier between 1 and 6),
    bonus_points numeric not null default 0,
    updated_at timestamptz not null default now(),
    unique (team_id, week)
);

create policy "Public can view bonus results"
    on bonus_results for select
    using (true);
