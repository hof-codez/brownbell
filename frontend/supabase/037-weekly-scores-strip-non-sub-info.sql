-- 037-weekly-scores-strip-non-sub-info.sql
-- Guarantees weekly_scores' sub_source / sub_original_name / sub_reason
-- (see 034-weekly-scores-sub-info.sql) only ever describe a genuine
-- substitute, no matter what writes the row - the automation, an Edge
-- Function, a manual SQL fix, or a one-off script.
--
-- Every substitutions row is logged the same way, so an initial pick, a
-- pre-lock change, and an original reclaiming his own slot all look like
-- a "substitute" unless the reason text is checked. Confirmed as a real
-- reported case: Puka Nacua's week 4 row was saved with sub_source
-- 'auto', "for Jaxon Smith-Njigba", reason "Reverted to original player -
-- original played", so Showdown showed the original pick himself as an
-- auto-sub. A second row (Omar Cooper, Next Up week 1, reason "Owner set
-- pick") showed as a sub "for (not set)". The automation's own filter
-- lives in substitution-reasons.js; this is the backstop for every other
-- path into the table. Keep the two lists in sync.

create or replace function weekly_scores_strip_non_sub_info()
returns trigger
language plpgsql
as $$
begin
    if new.sub_reason in ('Owner set pick', 'Owner changed pick before lock')
        or new.sub_reason like 'Reverted to original player%' then
        new.sub_source := null;
        new.sub_original_name := null;
        new.sub_reason := null;
    end if;
    return new;
end;
$$;

drop trigger if exists weekly_scores_strip_non_sub_info on weekly_scores;

create trigger weekly_scores_strip_non_sub_info
    before insert or update on weekly_scores
    for each row
    execute function weekly_scores_strip_non_sub_info();

-- One-time cleanup of any row already saved this way. The two known rows
-- were already corrected by hand on 2026-10-04; this catches anything
-- written between then and this migration.
update weekly_scores
set sub_source = null, sub_original_name = null, sub_reason = null
where sub_reason in ('Owner set pick', 'Owner changed pick before lock')
   or sub_reason like 'Reverted to original player%';
