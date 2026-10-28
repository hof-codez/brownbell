-- 038-trade-profiles.sql
-- Voting-habit stats per team, used to build owner profiles in the trade calculator.
-- Only counts votes cast before p_cutoff, so profiles move once a day, not live.
--
-- Each ballot ranks three assets: keep = 3, trade = 2, cut = 1. We compare that with
-- how the league's published ratings would rank the same three. The gap per group
-- (young, prime, vet, each position, picks) shows what an owner likes more or less
-- than the consensus does. Raw votes never leave the database.

create or replace function tc_vote_traits(p_cutoff timestamptz)
returns table (team_id uuid, grp text, n int, resid numeric)
language sql stable as $$
    with v as (
        select id as vid, team_id, keep_id, trade_id, cut_id
        from tc_votes where created_at < p_cutoff
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
            select case
                     when s.kind = 'pick' then 'pick'
                     else s.position end as grp
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
        -- a ballot agrees when the owner's order matches the consensus order exactly
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

revoke all on function tc_vote_traits(timestamptz) from public, anon, authenticated;
