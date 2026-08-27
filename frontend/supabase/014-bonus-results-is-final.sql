-- 014-bonus-results-is-final.sql
-- Adds is_final to bonus_results. Bonus scores still update live throughout
-- the week (Thursday night through Monday night) same as before - this
-- column just distinguishes "live, still in progress" from "the week is
-- genuinely over" (no games left pre/in-progress for that week), matching
-- standard fantasy convention where the weekly record isn't official until
-- after the last game (typically Monday Night Football). Run in the
-- Supabase SQL Editor after 013-duo-injury-status.sql.

alter table bonus_results
    add column is_final boolean not null default false;
