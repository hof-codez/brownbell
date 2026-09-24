-- 036-duos-ir-pup-countdown.sql
-- Supports the IR/PUP-to-permanent auto-conversion added to
-- update-standings.js's processDuoSlots: an IR/PUP substitution that's
-- held the same slot for 4+ consecutive weeks now auto-converts into
-- this award's one permanent swap, rather than sitting as an unlimited,
-- free, indefinite temporary sub the way a single-game out/doubtful
-- designation legitimately can. These two columns surface that state to
-- the Teams tab: the frozen original's own live status (distinct from
-- injury_status, which tracks the CURRENT occupant), and a countdown of
-- weeks remaining before the conversion happens automatically.

alter table duos
    add column original_injury_status text,
    add column ir_pup_weeks_until_permanent integer;

comment on column duos.original_injury_status is
    'Live injury status of the FROZEN ORIGINAL player for this slot, not the current occupant (injury_status already tracks that). Null unless a substitution has happened for this slot.';
comment on column duos.ir_pup_weeks_until_permanent is
    'Weeks remaining before this slot''s temporary IR/PUP substitution auto-converts to a permanent one. Null unless the frozen original is currently ir/pup AND this award''s permanent swap hasn''t been used yet.';
