-- 034-weekly-scores-sub-info.sql
-- Adds the same sub-tracking info the duos table's current_sub_* fields
-- already expose for the live week, but captured at write time on
-- weekly_scores itself - so a PLAYED week's stored row can say whether
-- that player was a substitute (and if so, a standby specifically), not
-- just the current/unplayed week. Without this, Showdown's matchup cards
-- had no way to show a Sub/Standby badge at all once a week was actually
-- scored, since weekly_scores previously carried nothing but the raw
-- points and player identity.

alter table weekly_scores
    add column sub_source text,
    add column sub_original_name text,
    add column sub_reason text;

comment on column weekly_scores.sub_source is
    'Same values as substitutions.source (owner/auto/admin) - null if this player was the original, never-substituted pick for this slot at this week.';
comment on column weekly_scores.sub_original_name is
    'The player this one replaced, if sub_source is set - null otherwise.';
comment on column weekly_scores.sub_reason is
    'The substitutions row''s own reason text, if sub_source is set - null otherwise. Its only current purpose is detecting a standby activation (starts with "Standby activated"), same prefix check the Teams/History/Showdown tabs all already use.';
