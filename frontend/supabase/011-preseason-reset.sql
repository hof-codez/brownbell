-- 011-preseason-reset.sql
-- ONE-TIME PRE-SEASON RESET. Run this in the Supabase SQL Editor once, before
-- owners start making their real picks. Wrapped in a transaction - either
-- everything below applies, or nothing does.
--
-- What this clears:
--   - duos            (every team's Main/Next Up player picks)
--   - duo_names       (every custom nickname - per your explicit request)
--   - substitutions   (the full activity/history log)
--   - bonus_results   (all bonus matchup results, computed off the cleared duos)
--   - weekly_scores   (all recorded scores)
--   - teams.permanent_swaps_used -> reset to 0
--   - teams.manual_privilege     -> reset to true
--
-- What this does NOT touch:
--   - teams, seasons        (the rows themselves, just the two columns above)
--   - schedule_snapshots / schedule_changes (NFL schedule tracking, not team data -
--     these refresh naturally as the automation runs, nothing to reset here)
--
-- Team claims (PINs/device authorization) are cleared separately - see
-- 012-clear-team-claims.sql - since you may want to run that independently
-- (e.g. if you only need to undo one test claim's worth of confusion, not a
-- full duo/history reset).
--
-- After this runs: every team's Teams tab shows "Not set yet" for all 4 slots,
-- the History tab is empty, and the Bonus tab shows every matchup as upcoming
-- with 0-0 scores - a genuinely clean slate.

begin;

delete from bonus_results;
delete from weekly_scores;
delete from substitutions;
delete from duo_names;
delete from duos;

update teams set permanent_swaps_used = 0, manual_privilege = true;

commit;
