-- 004-swap-tracking-columns.sql
-- Adds season-long permanent-swap tracking to teams. Run in the Supabase SQL
-- Editor after 003-public-read-policies-2.sql.
--
-- permanent_swaps_used: 0, 1, or 2 - counts trade/release-triggered permanent
--   swaps only. Injury-based temporary swaps never touch this counter.
-- manual_privilege: true until the team's 2nd permanent swap is consumed.
--   Once false, ALL future gaps (injury or trade/release, either award) are
--   filled by auto-sub only - the team has no manual override left for the
--   rest of the season.
--
-- No new RLS policy needed - "Public can view teams" (from 002) already
-- covers every column on this table, these two included.

alter table teams
    add column permanent_swaps_used int not null default 0,
    add column manual_privilege boolean not null default true;

alter table teams
    add constraint teams_permanent_swaps_used_check check (permanent_swaps_used between 0 and 2);
