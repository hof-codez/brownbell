-- 041-trade-vote-archive.sql
-- Lets a team change hands without losing the old owner's calculator votes.
-- Archived votes keep moving league values and the real-trade splits, but stop counting
-- toward the team's profile, daily cap, and "already voted" checks. The new owner starts clean.
-- Archiving is done by tc-handoff (see handoff-owner.js), never by the app.

alter table tc_votes add column if not exists archived boolean not null default false;
alter table tc_trade_votes add column if not exists archived boolean not null default false;

drop index if exists uq_tc_trade_votes_real;
create unique index uq_tc_trade_votes_real on tc_trade_votes (team_id, real_trade_id)
    where real_trade_id is not null and not archived;

create or replace function tc_votes_left(p_team uuid) returns int
language sql stable as $$
    with d as (select date_trunc('day', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix' as s)
    select (select max_votes_per_day from tc_settings where id = 1)
         - (select count(*) from tc_votes, d where team_id = p_team and not archived and created_at >= d.s)::int
         - (select count(*) from tc_trade_votes, d where team_id = p_team and not archived and created_at >= d.s)::int;
$$;

create or replace function tc_cast_vote(p_team uuid, p_keep text, p_trade text, p_cut text)
returns jsonb
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
         + (select count(*) from tc_trade_votes where team_id = p_team and not archived and created_at >= day_start)
      into used;
    if used >= cap then
        raise exception 'daily_limit' using errcode = 'P0001';
    end if;

    select count(*) into n_found from tc_assets
        where id in (p_keep, p_trade, p_cut) and rostered;
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

-- ---------------------------------------------------------------------------
-- Rating update for a bundle comparison. Each side's strength is the sum of its
-- assets after the star premium. The move is shared out in proportion to each
-- asset's part of its bundle, and gentler for assets that already have many votes.
-- ---------------------------------------------------------------------------
create or replace function tc_apply_bundle(p_x text[], p_y text[], p_outcome int, p_weight numeric)
returns void
language plpgsql as $$
declare
    star numeric; sx numeric; sy numeric; expected numeric; score numeric; d numeric;
begin
    select star_premium into star from tc_settings where id = 1;
    select coalesce(sum(10000 * power(rating / 10000.0, 1 + star)), 0) into sx from tc_assets where id = any(p_x);
    select coalesce(sum(10000 * power(rating / 10000.0, 1 + star)), 0) into sy from tc_assets where id = any(p_y);
    if sx = 0 or sy = 0 then return; end if;

    expected := 1 / (1 + power(10, (sy - sx) / 3000.0));
    score := case p_outcome when 1 then 1 when 0 then 0.5 else 0 end;
    d := 160 * (score - expected) * p_weight;

    update tc_assets a set
        rating = greatest(100, least(10000, a.rating
            + d * (10000 * power(a.rating / 10000.0, 1 + star) / sx) / sqrt(1 + a.votes / 40.0))),
        updated_at = now()
    where a.id = any(p_x);

    update tc_assets a set
        rating = greatest(100, least(10000, a.rating
            - d * (10000 * power(a.rating / 10000.0, 1 + star) / sy) / sqrt(1 + a.votes / 40.0))),
        updated_at = now()
    where a.id = any(p_y);
end $$;

-- ---------------------------------------------------------------------------
-- Casting a trade vote (offer or real). Same daily cap and weight rules as ballots.
-- For real trades, p_outcome is relative to x = what Team A received.
-- ---------------------------------------------------------------------------
create or replace function tc_cast_trade_vote(
    p_team uuid, p_kind text, p_x text[], p_y text[], p_outcome int, p_real_id text default null
) returns jsonb
language plpgsql as $$
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
         + (select count(*) from tc_trade_votes where team_id = p_team and not archived and created_at >= day_start)
      into used;
    if used >= cap then
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

    w := case when used + 1 <= full_n then 1 else red_w end;

    insert into tc_trade_votes (team_id, kind, x_ids, y_ids, outcome, real_trade_id, weight)
    values (p_team, p_kind, p_x, p_y, p_outcome, p_real_id, w);
    perform tc_apply_bundle(p_x, p_y, p_outcome, w);
    update tc_assets set votes = votes + 1 where id = any(all_ids);

    select (select count(*) from tc_votes where team_id = p_team and not archived)
         + (select count(*) from tc_trade_votes where team_id = p_team and not archived)
      into total;

    if p_kind = 'real' then split := tc_real_trade_split(p_real_id); end if;

    return jsonb_build_object('votesLeft', cap - used - 1, 'dayVotes', used + 1, 'weight', w,
                              'totalVotes', total, 'split', split);
end $$;

-- How owners voted on one real trade. Counts only, never who voted what.
create or replace function tc_real_trade_split(p_id text) returns jsonb
language sql stable as $$
    select jsonb_build_object(
        'aWon', count(*) filter (where outcome = 1),
        'even', count(*) filter (where outcome = 0),
        'bWon', count(*) filter (where outcome = -1),
        'total', count(*))
    from tc_trade_votes where real_trade_id = p_id;
$$;

-- Next real trade for a voter: not theirs, none of their players in it, not voted yet,
-- every asset still tracked. Least voted first, random among ties.
create or replace function tc_next_real_trade(p_team uuid)
returns table (id text, happened_at timestamptz, side_a text[], side_b text[])
language sql stable as $$
    select t.id, t.happened_at, t.side_a, t.side_b
    from tc_real_trades t
    where (t.team_a is null or t.team_a <> p_team)
      and (t.team_b is null or t.team_b <> p_team)
      and not exists (select 1 from tc_trade_votes v where v.team_id = p_team and not v.archived and v.real_trade_id = t.id)
      and not exists (select 1 from unnest(t.side_a || t.side_b) a(id)
                      where not exists (select 1 from tc_assets s where s.id = a.id and s.rostered))
      and not exists (select 1 from tc_holdings h where h.team_id = p_team and h.asset_id = any (t.side_a || t.side_b))
    order by (select count(*) from tc_trade_votes v where v.real_trade_id = t.id), random()
    limit 1;
$$;

-- Sync from Sleeper (called by tc-seed.js). Adds new trades, never deletes votes.
create or replace function tc_sync_real_trades(p_trades jsonb) returns int
language plpgsql as $$
declare n int;
begin
    insert into tc_real_trades (id, happened_at, side_a, side_b, team_a, team_b)
    select x->>'id', (x->>'happened_at')::timestamptz,
           array(select jsonb_array_elements_text(x->'side_a')),
           array(select jsonb_array_elements_text(x->'side_b')),
           nullif(x->>'team_a', '')::uuid, nullif(x->>'team_b', '')::uuid
    from jsonb_array_elements(p_trades) x
    on conflict (id) do update set
        team_a = excluded.team_a, team_b = excluded.team_b,
        side_a = excluded.side_a, side_b = excluded.side_b;
    get diagnostics n = row_count;
    return n;
end $$;

-- ---------------------------------------------------------------------------
-- Owner traits: now also learns from trade votes.
--   '_all'   = every vote of any kind (decides early/solid read)
--   '_votes' = ballots only, with how often the owner matched the consensus order
--   consolidate / spread = how they judge many-for-one and one-for-many trades
--   pick = folded in: receiving picks counts for, giving picks counts against
-- Gap = owner's verdict minus what the published ratings predict, on a -2..2 scale.
-- ---------------------------------------------------------------------------
drop function if exists tc_vote_traits(timestamptz, uuid);
create or replace function tc_vote_traits(p_cutoff timestamptz, p_team uuid default null)
returns table (team_id uuid, grp text, n int, resid numeric)
language sql stable as $$
    with star as (select star_premium as p from tc_settings where id = 1),
    v as (
        select id as vid, team_id, keep_id, trade_id, cut_id
        from tc_votes
        where not archived and created_at < p_cutoff and (p_team is null or team_id = p_team)
    ),
    items as (
        select vid, team_id, keep_id as asset_id, 3 as actual from v
        union all select vid, team_id, trade_id, 2 from v
        union all select vid, team_id, cut_id, 1 from v
    ),
    scored as (
        select i.vid, i.team_id, i.actual, a.kind, a.position, a.age,
               row_number() over (partition by i.vid order by a.published_rating asc, a.id) as expected
        from items i join tc_assets a on a.id = i.asset_id
    ),
    grouped as (
        select s.team_id, g.grp, (s.actual - s.expected)::numeric as resid
        from scored s
        cross join lateral (
            select case when s.kind = 'pick' then 'pick' else s.position end as grp
            union all
            select case
                     when s.kind = 'pick' or s.age is null then null
                     when s.age <= 24 then 'young'
                     when s.age <= 28 then 'prime'
                     else 'vet' end
        ) g
        where g.grp is not null
    ),
    agree as (
        select team_id, '_votes'::text as grp, count(*)::int as n,
               sum(case when resid_abs = 0 then 1 else 0 end)::numeric as resid
        from (
            select vid, team_id, sum(abs(actual - expected)) as resid_abs
            from scored group by vid, team_id
        ) b
        group by team_id
    ),
    tv as (
        select t.id, t.team_id, t.x_ids, t.y_ids, t.outcome
        from tc_trade_votes t
        where not t.archived and t.created_at < p_cutoff and (p_team is null or t.team_id = p_team)
    ),
    tvs as (
        select tv.*,
               (select coalesce(sum(10000 * power(a.published_rating / 10000.0, 1 + star.p)), 0)
                  from tc_assets a where a.id = any(tv.x_ids)) as sx,
               (select coalesce(sum(10000 * power(a.published_rating / 10000.0, 1 + star.p)), 0)
                  from tc_assets a where a.id = any(tv.y_ids)) as sy,
               exists (select 1 from tc_assets a where a.id = any(tv.x_ids) and a.kind = 'pick') as x_pick,
               exists (select 1 from tc_assets a where a.id = any(tv.y_ids) and a.kind = 'pick') as y_pick
        from tv cross join star
    ),
    tvr as (
        select team_id, x_ids, y_ids, x_pick, y_pick,
               (outcome - (2 * (1 / (1 + power(10, (sy - sx) / 3000.0))) - 1))::numeric as resid
        from tvs
    ),
    trade_groups as (
        select team_id, 'consolidate'::text as grp, resid from tvr where cardinality(x_ids) < cardinality(y_ids)
        union all
        select team_id, 'spread', resid from tvr where cardinality(x_ids) > cardinality(y_ids)
        union all
        select team_id, 'pick', resid from tvr where x_pick and not y_pick
        union all
        select team_id, 'pick', -resid from tvr where y_pick and not x_pick
    ),
    all_rows as (
        select team_id, grp, count(*)::int as n, sum(resid) as resid from grouped group by team_id, grp
        union all select team_id, grp, n, resid from agree
        union all select team_id, grp, count(*)::int, sum(resid) from trade_groups group by team_id, grp
        union all select team_id, '_all', count(*)::int, 0::numeric from v group by team_id
        union all select team_id, '_all', count(*)::int, 0::numeric from tv group by team_id
    )
    select team_id, grp, sum(n)::int, sum(resid) from all_rows group by team_id, grp;
$$;

revoke all on function tc_votes_left(uuid) from public, anon, authenticated;
revoke all on function tc_cast_vote(uuid, text, text, text) from public, anon, authenticated;
revoke all on function tc_cast_trade_vote(uuid, text, text[], text[], int, text) from public, anon, authenticated;
revoke all on function tc_next_real_trade(uuid) from public, anon, authenticated;
revoke all on function tc_vote_traits(timestamptz, uuid) from public, anon, authenticated;
