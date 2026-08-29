-- 017-season-of-boom-award.sql
-- Adds 'boom' as a valid award_type across every table that constrains it,
-- for the new Season of Boom (SOB) award - 2 IDP duo slots per team,
-- scored and tracked the same way as Main Award and Next Up, but with no
-- weekly bonus/matchup system (that's a Main Award-only mechanic) and its
-- own separate season-long standings, not combined into the Brown Bell
-- Award total.
--
-- bonus_results is deliberately NOT touched here - it has no award_type
-- column at all.
--
-- Finds and drops the existing check constraint on each table dynamically
-- rather than assuming Postgres's default naming convention still holds -
-- safer than hardcoding a constraint name that might not actually match.
--
-- Run in the Supabase SQL Editor after 016-weekly-scores-player-index.sql.

do $$
declare
    r record;
begin
    for r in
        select conname, conrelid::regclass::text as table_name
        from pg_constraint
        where contype = 'c'
          and conrelid::regclass::text in ('duos', 'substitutions', 'weekly_scores', 'duo_names', 'roster_changes')
          and pg_get_constraintdef(oid) like '%award_type%'
    loop
        execute format('alter table %s drop constraint %I', r.table_name, r.conname);
    end loop;
end $$;

alter table duos add constraint duos_award_type_check check (award_type in ('main', 'nextup', 'boom'));
alter table substitutions add constraint substitutions_award_type_check check (award_type in ('main', 'nextup', 'boom'));
alter table weekly_scores add constraint weekly_scores_award_type_check check (award_type in ('main', 'nextup', 'boom'));
alter table duo_names add constraint duo_names_award_type_check check (award_type in ('main', 'nextup', 'boom'));
alter table roster_changes add constraint roster_changes_award_type_check check (award_type in ('main', 'nextup', 'boom'));
