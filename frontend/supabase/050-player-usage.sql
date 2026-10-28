-- 050-player-usage.sql
-- Usage signals per player, written by tc-seed.js from nflverse stats and the fitted usage model.
--   usage_ppg   points per game his targets, carries and attempts support
--   usage_gap   points per game he scores above (+) or below (-) that
--   usage_games games behind those numbers
--   proj_ppg    rest-of-season expectation: half this season's points, half usage-implied
alter table tc_player_status
    add column if not exists usage_ppg numeric,
    add column if not exists usage_gap numeric,
    add column if not exists usage_games int,
    add column if not exists targets_pg numeric,
    add column if not exists carries_pg numeric,
    add column if not exists proj_ppg numeric;
