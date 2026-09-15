-- 031-bonus-results-outcome-final.sql
-- Adds a second, independent finality flag to bonus_results, separate
-- from the existing is_final. Confirmed as a real, deliberately-designed
-- gap: is_final only ever becomes true once the ENTIRE week's matchups
-- are done (since tiers rank all 6 matchups' scores against each other
-- in one shared sort, so the tier/bonus amount genuinely isn't stable
-- until then) - but a specific matchup's own WINNER is decided as soon
-- as that matchup's own 4 players are done, independent of the rest of
-- the week. The season-long W-L-T record was incorrectly forced to use
-- is_final too, meaning every matchup's record had to wait on the
-- week's single slowest game (typically Monday Night Football) even
-- though 5 of 6 winners were already known hours earlier.
--
-- outcome_final drives the W-L-T record specifically; is_final continues
-- to drive the tier/bonus-amount finality and the "(Not Final)" label on
-- each matchup card - those genuinely do still need the whole week.
--
-- Run in the Supabase SQL Editor after 030-weekly-scores-key-on-slot-v2.sql.

alter table bonus_results add column outcome_final boolean not null default false;
