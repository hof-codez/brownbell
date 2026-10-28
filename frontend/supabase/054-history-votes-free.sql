-- 054-history-votes-free.sql
-- Votes on real league trades (History tab) no longer use the daily vote limit, do not move the
-- full-weight counter, and always count at full weight. There is one per owner per trade, so the
-- supply is finite. They still move ratings and still count toward the owner's profile.

create or replace function tc_votes_left(p_team uuid) returns integer
language sql stable as $$
    with d as (select date_trunc('day', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix' as s)
    select (select max_votes_per_day from tc_settings where id = 1)
         - (select count(*) from tc_votes, d where team_id = p_team and not archived and created_at >= d.s)::int
         - (select count(*) from tc_trade_votes, d where team_id = p_team and not archived and kind <> 'real' and created_at >= d.s)::int;
$$;

create or replace function tc_cast_vote(p_team uuid, p_keep text, p_trade text, p_cut text) returns jsonb
language plpgsql as $$
declare
    cap int; full_n int; red_w numeric;
    used int; w numeric; total int;
    day_start timestamptz;
    n_found int;
begin
    select max_votes_per_day, full_weight_votes, reduced_weight
      into cap, full_n, red_w from tc_settings where id = 1;
    perform pg_advisory_xact_lock(hashtext('tc_vote:' || p_team::text));
    day_start := date_trunc('day', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix';
    select (select count(*) from tc_votes where team_id = p_team and not archived and created_at >= day_start)
         + (select count(*) from tc_trade_votes where team_id = p_team and not archived and kind <> 'real' and created_at >= day_start)
      into used;
    if used >= cap then
        raise exception 'daily_limit' using errcode = 'P0001';
    end if;
    select count(*) into n_found from tc_assets where id in (p_keep, p_trade, p_cut) and rostered;
    if n_found <> 3 then
        raise exception 'bad_assets' using errcode = 'P0002';
    end if;
    if exists (select 1 from tc_holdings where team_id = p_team and asset_id in (p_keep, p_trade, p_cut)) then
        raise exception 'own_asset' using errcode = 'P0003';
    end if;
    perform 1 from tc_assets where id in (p_keep, p_trade, p_cut) order by id for update;
    w := case when used + 1 <= full_n then 1 else red_w end;
    insert into tc_votes (team_id, keep_id, trade_id, cut_id, weight) values (p_team, p_keep, p_trade, p_cut, w);
    perform tc_apply_pair(p_keep, p_trade, w);
    perform tc_apply_pair(p_keep, p_cut, w);
    perform tc_apply_pair(p_trade, p_cut, w);
    update tc_assets set votes = votes + 1 where id in (p_keep, p_trade, p_cut);
    select (select count(*) from tc_votes where team_id = p_team and not archived)
         + (select count(*) from tc_trade_votes where team_id = p_team and not archived)
      into total;
    return jsonb_build_object('votesLeft', cap - used - 1, 'dayVotes', used + 1, 'weight', w, 'totalVotes', total);
end $$;

create or replace function tc_cast_trade_vote(p_team uuid, p_kind text, p_x text[], p_y text[], p_outcome integer, p_real_id text default null)
returns jsonb language plpgsql as $$
declare
    cap int; full_n int; red_w numeric;
    used int; w numeric; total int;
    day_start timestamptz;
    all_ids text[];
    rt tc_real_trades%rowtype;
    split jsonb;
begin
    if p_kind not in ('offer', 'real') or p_outcome not in (-1, 0, 1) then
        raise exception 'bad_request' using errcode = 'P0004';
    end if;
    if cardinality(p_x) not between 1 and 3 or cardinality(p_y) not between 1 and 3 then
        raise exception 'bad_assets' using errcode = 'P0002';
    end if;
    all_ids := p_x || p_y;
    if (select count(distinct v) from unnest(all_ids) v) <> cardinality(all_ids) then
        raise exception 'bad_assets' using errcode = 'P0002';
    end if;

    select max_votes_per_day, full_weight_votes, reduced_weight
      into cap, full_n, red_w from tc_settings where id = 1;
    perform pg_advisory_xact_lock(hashtext('tc_vote:' || p_team::text));

    day_start := date_trunc('day', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix';
    select (select count(*) from tc_votes where team_id = p_team and not archived and created_at >= day_start)
         + (select count(*) from tc_trade_votes where team_id = p_team and not archived and kind <> 'real' and created_at >= day_start)
      into used;
    if p_kind <> 'real' and used >= cap then
        raise exception 'daily_limit' using errcode = 'P0001';
    end if;

    if (select count(*) from tc_assets where id = any(all_ids) and rostered) <> cardinality(all_ids) then
        raise exception 'bad_assets' using errcode = 'P0002';
    end if;
    if exists (select 1 from tc_holdings where team_id = p_team and asset_id = any(all_ids)) then
        raise exception 'own_asset' using errcode = 'P0003';
    end if;

    if p_kind = 'real' then
        select * into rt from tc_real_trades where id = p_real_id;
        if not found or rt.team_a = p_team or rt.team_b = p_team then
            raise exception 'bad_assets' using errcode = 'P0002';
        end if;
        if exists (select 1 from tc_trade_votes where team_id = p_team and not archived and real_trade_id = p_real_id) then
            raise exception 'already_voted' using errcode = 'P0005';
        end if;
    end if;

    perform 1 from tc_assets where id = any(all_ids) order by id for update;

    -- real trade votes are separate from the daily budget and always count in full
    w := case when p_kind = 'real' then 1 when used + 1 <= full_n then 1 else red_w end;

    insert into tc_trade_votes (team_id, kind, x_ids, y_ids, outcome, real_trade_id, weight)
    values (p_team, p_kind, p_x, p_y, p_outcome, p_real_id, w);
    perform tc_apply_bundle(p_x, p_y, p_outcome, w);
    update tc_assets set votes = votes + 1 where id = any(all_ids);

    select (select count(*) from tc_votes where team_id = p_team and not archived)
         + (select count(*) from tc_trade_votes where team_id = p_team and not archived)
      into total;

    if p_kind = 'real' then split := tc_real_trade_split(p_real_id); end if;

    return jsonb_build_object(
        'votesLeft', case when p_kind = 'real' then greatest(0, cap - used) else cap - used - 1 end,
        'dayVotes', case when p_kind = 'real' then 0 else used + 1 end,
        'weight', w, 'totalVotes', total, 'split', split);
end $$;
