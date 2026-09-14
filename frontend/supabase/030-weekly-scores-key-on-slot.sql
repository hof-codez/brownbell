-- 030-weekly-scores-key-on-slot.sql
-- Fixes a real design flaw confirmed directly via a live incident: the
-- unique constraint backing saveWeeklyScores' upsert included
-- sleeper_player_id as part of the key, meaning a slot's player changing
-- within a week that already had a saved row for it didn't REPLACE that
-- row - it added a second one alongside it, permanently orphaning the
-- old player's row. This is exactly why Kenyatta93's Brown Bell matchup
-- briefly showed 3 players instead of 2 after an admin correction
-- swapped a slot's player via direct SQL, bypassing the app's own
-- protections against exactly this.
--
-- The correct key is the SLOT itself (team_id, award_type, week,
-- player_index) - there is always exactly one real answer to "who was
-- credited for this slot in this week," and whoever that is should
-- REPLACE any previous row for that same slot/week, not accumulate
-- alongside it.
--
-- IMPORTANT - run cleanup-orphaned-weekly-score.sql (or otherwise
-- resolve any existing duplicate team_id/award_type/week/player_index
-- combination) BEFORE this migration. Adding the new, stricter unique
-- constraint will fail outright if any such duplicate still exists in
-- the table.
--
-- Run in the Supabase SQL Editor after 029-substitutions-admin-source.sql.

DO $$
DECLARE
    v_constraint_name text;
BEGIN
    -- Finds the actual existing constraint name dynamically rather than
    -- assuming Postgres's default auto-generated name, since that name
    -- depends on exactly how/when the table was originally created.
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'weekly_scores'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%sleeper_player_id%'
      AND pg_get_constraintdef(oid) NOT LIKE '%player_index%';

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE weekly_scores DROP CONSTRAINT %I', v_constraint_name);
    END IF;

    ALTER TABLE weekly_scores
        ADD CONSTRAINT weekly_scores_slot_key
        UNIQUE (team_id, award_type, week, player_index);
END $$;
