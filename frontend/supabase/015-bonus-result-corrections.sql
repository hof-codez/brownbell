-- 015-bonus-result-corrections.sql
-- Records a snapshot whenever a bonus_results row that was ALREADY marked
-- final gets overwritten with different numbers - almost always a Sleeper
-- stat correction (commonly settled the Tuesday after Monday Night
-- Football, but this catches it whenever it actually happens). Kept
-- separate from substitutions - that table is about player changes, this is
-- about a score/outcome changing after the fact, a genuinely different kind
-- of event. Run in the Supabase SQL Editor after 014-bonus-results-is-final.sql.

create table bonus_result_corrections (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    week int not null,
    original_team_score numeric not null,
    corrected_team_score numeric not null,
    original_outcome text not null,
    corrected_outcome text not null,
    original_tier int,
    corrected_tier int,
    original_bonus_points numeric not null,
    corrected_bonus_points numeric not null,
    detected_at timestamptz not null default now()
);

alter table bonus_result_corrections enable row level security;

create policy "Public can view bonus result corrections"
    on bonus_result_corrections for select
    using (true);
