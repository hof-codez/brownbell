-- 024-duo-player-team.sql
-- Adds each duo slot's player's current NFL team - needed so the frontend
-- can show "next game, opponent, kickoff time" for each player without a
-- separate lookup against the full Sleeper player database (which is a
-- ~5MB fetch Sleeper's own docs say to call at most once a day, not
-- something to pull client-side on every card render).
--
-- Written by both the Node automation (upsertDuoSlot, resolved from its
-- already-loaded players data) and the set-duo Edge Function (an owner's
-- manual pick) - kept in sync on every write, from either source.
--
-- Run in the Supabase SQL Editor after 023-nfl-schedule.sql.

alter table duos add column player_team text;
