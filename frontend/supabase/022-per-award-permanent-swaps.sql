-- 022-per-award-permanent-swaps.sql
-- Replaces the single shared permanent-swap budget with three independent
-- ones, one per award. Previously a team got 2 permanent swaps total
-- across Brown Bell, Next Up, and Season of Boom combined - and the 2nd
-- one was always auto-filled anyway (no manual choice), so the
-- meaningful number was really "1 manual choice, shared." That sharing
-- was unfair: one award has nothing to do with another, so a permanent
-- departure in one shouldn't eat into another's budget.
--
-- Now each award gets its own single permanent swap: the owner picks the
-- replacement once, and any further permanent departure for that same
-- award auto-fills from then on - unrelated to what's happened in the
-- other two awards.
--
-- Reduced from a counter (0-2) + separate privilege flag to a single
-- boolean per award, since the budget is now 1: "used" and "no more
-- manual privilege for this award" are the same moment, not two.
--
-- Existing shared swap state cannot be attributed to a specific award
-- retroactively, so every team starts fresh across all three awards
-- under the new rule - reasonable this early in the season, and this is
-- a genuine rule change rather than a data-preservation scenario.
--
-- Run in the Supabase SQL Editor after 021-matchup-taunts.sql.

alter table teams
    add column main_permanent_swap_used boolean not null default false,
    add column nextup_permanent_swap_used boolean not null default false,
    add column boom_permanent_swap_used boolean not null default false;

alter table teams drop column permanent_swaps_used;
alter table teams drop column manual_privilege;
