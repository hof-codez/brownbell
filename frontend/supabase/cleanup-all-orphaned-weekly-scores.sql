-- cleanup-all-orphaned-weekly-scores.sql
-- Removes ALL orphaned weekly_scores rows league-wide, not just the one
-- specific Kenyatta93 case. Confirmed as a broader issue than first
-- scoped: the same bug affected every legitimate auto-sub too (e.g.
-- KnowItAllJankyJew's Brock Bowers -> Rashee Rice), not only the direct-
-- SQL admin correction - any time a slot's player changed after a
-- weekly_scores row already existed for that slot/week (which happens
-- for EVERY current duo player EVERY run, even pre-game, since points
-- start at 0 before a game begins), the old row was orphaned instead of
-- replaced.
--
-- For each (team_id, award_type, week, player_index) that currently has
-- more than one row, keeps ONLY the row matching whoever the duos table
-- says is ACTUALLY in that slot right now, and deletes the rest. Safe
-- for a slot with no duplicates at all - nothing happens to it.
--
-- Run in the Supabase SQL Editor AFTER 030-weekly-scores-key-on-slot.sql
-- (so the fixed upsert key is already in place and this cleanup doesn't
-- immediately get undone by the next automation run).

DELETE FROM weekly_scores ws
WHERE EXISTS (
    -- This row is a duplicate slot/week (more than one row currently
    -- exists for the same team/award/week/index)...
    SELECT 1 FROM weekly_scores dup
    WHERE dup.team_id = ws.team_id
      AND dup.award_type = ws.award_type
      AND dup.week = ws.week
      AND dup.player_index = ws.player_index
      AND dup.id != ws.id
)
AND NOT EXISTS (
    -- ...and this specific row is NOT the one matching who's actually in
    -- that slot right now, per the duos table (the current source of truth).
    SELECT 1 FROM duos d
    WHERE d.team_id = ws.team_id
      AND d.award_type = ws.award_type
      AND d.player_index = ws.player_index
      AND d.sleeper_player_id = ws.sleeper_player_id
);
