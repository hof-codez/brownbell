-- 016-weekly-scores-player-index.sql
-- Adds player_index to weekly_scores. This should have been part of the
-- original table (007/009 already added player_name/player_position/was_bye
-- for the exact same "captured at write time, not resolved later" reason)
-- but was missed - the automation had player_index available every time it
-- wrote a row, it just never got saved. Needed so the frontend can tell
-- which duo slot (0 or 1) a given week's score belongs to, independent of
-- which player occupied it (a mid-season substitution can put a different
-- player in the same slot across different weeks). Run in the Supabase SQL
-- Editor after 015-bonus-result-corrections.sql.

alter table weekly_scores
    add column player_index int;
