-- 019-matchup-predictions.sql
-- Weekly "who will win this matchup" prediction poll. Every claimed-team
-- owner can vote on every Brown Bell bonus matchup each week (not just
-- their own), scored in fixed 4-week blocks (1-4, 5-8, 9-12) - stops at
-- week 14 along with the bonus matchup mechanic itself, so the trailing
-- partial block (13-14) is only 2 real weeks, handled by the tally logic
-- rather than assumed to always be 4.
--
-- team_a_id/team_b_id are always stored with the lower id first (enforced
-- by the check constraint below) so the unique constraint catches a
-- duplicate vote regardless of which order the matchup happens to be
-- described in - the submitting Edge Function is responsible for sorting
-- them consistently before insert.
--
-- Run in the Supabase SQL Editor after 018-team-backgrounds.sql.

create table matchup_predictions (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references seasons(id) on delete cascade,
    week int not null check (week between 1 and 14),
    voter_team_id uuid not null references teams(id) on delete cascade,
    team_a_id uuid not null references teams(id) on delete cascade,
    team_b_id uuid not null references teams(id) on delete cascade,
    predicted_winner_team_id uuid not null references teams(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (team_a_id < team_b_id),
    check (predicted_winner_team_id = team_a_id or predicted_winner_team_id = team_b_id),
    unique (voter_team_id, season_id, week, team_a_id, team_b_id)
);

create index idx_matchup_predictions_week on matchup_predictions (season_id, week);

alter table matchup_predictions enable row level security;
create policy "public read" on matchup_predictions for select using (true);
