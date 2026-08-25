-- 013-duo-injury-status.sql
-- Adds injury_status to duos, refreshed by the automation every run for every
-- currently-set slot (not just ones getting substituted) - this is purely a
-- display field for the Teams tab's injury dots, and never drives any
-- substitution decision on its own (that logic already lives in
-- processDuoSlots, reading live Sleeper data directly each time). Run in the
-- Supabase SQL Editor after 012-clear-team-claims.sql.

alter table duos
    add column injury_status text; -- Sleeper's raw status: 'Questionable', 'Doubtful', 'Out', 'IR', 'PUP', or null if healthy
