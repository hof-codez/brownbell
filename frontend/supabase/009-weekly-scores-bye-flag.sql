-- 009-weekly-scores-bye-flag.sql
-- Adds was_bye to weekly_scores, captured at write time (same as
-- player_name/player_position) so a "BYE" badge can be shown accurately for
-- any past week, not just the current one - a 0-point week is otherwise
-- ambiguous between "genuinely scored zero" and "was on bye." Run in the
-- Supabase SQL Editor after 008-bonus-results.sql.

alter table weekly_scores
    add column was_bye boolean not null default false;
