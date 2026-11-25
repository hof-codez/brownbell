-- 056-two-permanent-swaps.sql
-- Each award now gets 2 permanent (manual) swaps per season instead of 1.
-- *_permanent_swap_used stays as the "budget exhausted" flag every reader already uses
-- (it now means count >= limit). *_swaps_count holds how many have been spent.
-- The limit lives in use_permanent_swap() below; change it there if it changes again.

alter table teams
    add column if not exists main_swaps_count integer not null default 0,
    add column if not exists nextup_swaps_count integer not null default 0,
    add column if not exists boom_swaps_count integer not null default 0;

-- Anyone who had spent their one swap has spent 1 of 2.
update teams set main_swaps_count = 1 where main_permanent_swap_used and main_swaps_count = 0;
update teams set nextup_swaps_count = 1 where nextup_permanent_swap_used and nextup_swaps_count = 0;
update teams set boom_swaps_count = 1 where boom_permanent_swap_used and boom_swaps_count = 0;
update teams set
    main_permanent_swap_used = main_swaps_count >= 2,
    nextup_permanent_swap_used = nextup_swaps_count >= 2,
    boom_permanent_swap_used = boom_swaps_count >= 2;

-- Atomically spend one swap. Returns the new count; sets the exhausted flag at the limit.
create or replace function use_permanent_swap(p_team_id uuid, p_award text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    swap_limit constant integer := 2;
    new_count integer;
begin
    if p_award = 'nextup' then
        update teams set nextup_swaps_count = nextup_swaps_count + 1,
            nextup_permanent_swap_used = (nextup_swaps_count + 1) >= swap_limit
            where id = p_team_id returning nextup_swaps_count into new_count;
    elsif p_award = 'boom' then
        update teams set boom_swaps_count = boom_swaps_count + 1,
            boom_permanent_swap_used = (boom_swaps_count + 1) >= swap_limit
            where id = p_team_id returning boom_swaps_count into new_count;
    else
        update teams set main_swaps_count = main_swaps_count + 1,
            main_permanent_swap_used = (main_swaps_count + 1) >= swap_limit
            where id = p_team_id returning main_swaps_count into new_count;
    end if;
    return new_count;
end;
$$;

revoke all on function use_permanent_swap(uuid, text) from public, anon, authenticated;
grant execute on function use_permanent_swap(uuid, text) to service_role;
