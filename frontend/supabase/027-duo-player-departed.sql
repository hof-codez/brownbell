-- 027-duo-player-departed.sql
-- Flags a duo slot whose currently-set player has already left this
-- team's actual Sleeper roster (a fantasy trade or waiver drop),
-- specifically for the PRE-LOCK case - a locked slot's departure is
-- already actively resolved (cleared/auto-filled/reverted) by the
-- existing permanent-departure logic, but a pre-lock slot is
-- intentionally left alone by the automation (fully owner-editable), so
-- without this flag the display would keep showing a player who is no
-- longer actually on that roster with nothing indicating so.
--
-- Written by the Node automation (processDuoSlots), read-only from the
-- frontend, which shows a clear "no longer on roster" indicator instead
-- of silently displaying a stale name - see DuoSlotDisplay.tsx.
--
-- Run in the Supabase SQL Editor after 026-rotowire-player-links.sql.

alter table duos add column player_departed boolean not null default false;
