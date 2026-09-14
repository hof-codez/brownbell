-- cleanup-orphaned-weekly-score.sql
-- Removes a stale, orphaned weekly_scores row left over from the A.J.
-- Brown admin correction. saveWeeklyScores' upsert key includes
-- sleeper_player_id (see the accompanying fix), so when the slot's
-- player changed via direct SQL, the new row for A.J. Brown never
-- overwrote the old row for Shedeur Sanders - both now exist for the
-- same team/award/week, which is why the Showdown tab shows 3 players
-- for a 2-player award.
--
-- Run in the Supabase SQL Editor. Safe to run even if the row has
-- already been cleaned up some other way - it simply deletes nothing
-- in that case.

DELETE FROM weekly_scores
WHERE
    team_id = (SELECT id FROM teams WHERE display_name = 'Kenyatta93')
    AND award_type = 'main'
    AND week = 1
    AND player_name = 'Shedeur Sanders';
