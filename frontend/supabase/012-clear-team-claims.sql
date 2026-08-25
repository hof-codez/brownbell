-- Run this in addition to (or separately from) 011-preseason-reset.sql.
-- Clears every team's claim - PIN and authorized device(s) - so every owner,
-- including yourself, claims their real team fresh with a real PIN. Safe to
-- run whether or not you've already run the main reset script; this table
-- is independent of duos/scores/history.
--
-- After this runs: every team shows as unclaimed. Anyone opening the site
-- sees the claim prompt again, even if they'd claimed before.

delete from team_claims;
