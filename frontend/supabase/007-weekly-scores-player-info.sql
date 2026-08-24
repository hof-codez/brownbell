-- 007-weekly-scores-player-info.sql
-- Adds player_name and player_position to weekly_scores, captured at write
-- time. Necessary for showing "who scored what" accurately in the League
-- tab - resolving names from the CURRENT duos entry would show the wrong
-- player for any past week where a swap happened since. Run in the Supabase
-- SQL Editor after 006-public-read-weekly-scores.sql.

alter table weekly_scores
    add column player_name text,
    add column player_position text;
