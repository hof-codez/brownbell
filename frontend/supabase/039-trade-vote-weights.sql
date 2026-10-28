-- 039-trade-vote-weights.sql
-- Higher daily vote cap, with reduced influence on league values after the first few
-- votes each day. Profiles still learn from every vote. Also adds a per-team trait
-- lookup so a voter can preview their own read right away.

alter table tc_settings add column if not exists full_weight_votes int not null default 5;
alter table tc_settings add column if not exists reduced_weight numeric not null default 0.5;
update tc_settings set max_votes_per_day = 25 where id = 1 and max_votes_per_day = 5;

alter table tc_votes add column if not exists weight numeric not null default 1;

-- ---------------------------------------------------------------------------
-- Rating update, now scaled by the vote's weight
-- ---------------------------------------------------------------------------
drop function if exists tc_apply_pair(text, text);
create or replace function tc_apply_pair(winner text, loser text, p_weight numeric default 1) returns void
language plpgsql as $$
declare
    rw numeric; rl numeric; vw int; vl int;
    expected numeric; kw numeric; kl numeric; delta_w numeric; delta_l numeric;
begin
    select rating, votes into rw, vw from tc_assets where id = winner;
    select rating, votes into rl, vl from tc_assets where id = loser;
    expected := 1 / (1 + power(10, (rl - rw) / 3000.0));
    kw := 160 / sqrt(1 + vw / 40.0);
    kl := 160 / sqrt(1 + vl / 40.0);
    delta_w := p_weight * kw * (1 - expected);
    delta_l := p_weight * kl * (1 - expected);
    update tc_assets set rating = least(10000, rating + delta_w), updated_at = now() where id = winner;
    update tc_assets set rating = greatest(100, rating - delta_l), updated_at = now() where id = loser;
end $$;

-- ---------------------------------------------------------------------------
-- Casting a vote. Returns jsonb: votesLeft, dayVotes (this one included), weight, totalVotes
-- ---------------------------------------------------------------------------
drop function if exists tc_cast_vote(uuid, text, text, text);
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
    select count(*) into used from tc_votes where team_id = p_team and created_at >= day_start;
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

    select count(*) into total from tc_votes where team_id = p_team;
    return jsonb_build_object('votesLeft', cap - used - 1, 'dayVotes', used + 1, 'weight', w, 'totalVotes', total);
end $$;

-- ---------------------------------------------------------------------------
-- Trait stats, optionally for one team (used for the voter's own live preview)
-- ---------------------------------------------------------------------------
drop function if exists tc_vote_traits(timestamptz);
create or replace function tc_vote_traits(p_cutoff timestamptz, p_team uuid default null)
returns table (team_id uuid, grp text, n int, resid numeric)
language sql stable as $$
    with v as (
        select id as vid, team_id, keep_id, trade_id, cut_id
        from tc_votes
        where created_at < p_cutoff and (p_team is null or team_id = p_team)
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
    )
    select team_id, grp, count(*)::int, sum(resid) from grouped group by team_id, grp
    union all
    select team_id, grp, n, resid from agree;
$$;

revoke all on function tc_apply_pair(text, text, numeric) from public, anon, authenticated;
revoke all on function tc_cast_vote(uuid, text, text, text) from public, anon, authenticated;
revoke all on function tc_vote_traits(timestamptz, uuid) from public, anon, authenticated;
