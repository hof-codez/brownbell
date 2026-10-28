-- 045-team-picks.sql
-- Draft picks are now one asset per original team ("pick:<year>:<round>:<sleeper roster id>"),
-- owned by whoever holds them in Sleeper, and valued by where the original team is headed in
-- the standings. rating is the learned, slot-neutral value. pick_mult scales it for the
-- original team's projected draft slot, and the published value is rating * pick_mult.
-- The old generic picks ("pick:<year>:<round>") stay as history and stop being rostered.

alter table tc_assets add column if not exists pick_mult numeric not null default 1;

create or replace function tc_live_publish() returns trigger
language plpgsql as $$
begin
    new.published_rating := least(10000, new.rating * new.pick_mult);
    return new;
end $$;

drop trigger if exists tc_assets_live_publish on tc_assets;
create trigger tc_assets_live_publish
    before update of rating, pick_mult on tc_assets
    for each row execute function tc_live_publish();

drop trigger if exists tc_assets_bump_version on tc_assets;
create trigger tc_assets_bump_version
    after update of rating, pick_mult on tc_assets
    for each statement execute function tc_bump_version();

-- Votes compare what the league sees, so sums use the multiplied value.
create or replace function tc_apply_bundle(p_x text[], p_y text[], p_outcome int, p_weight numeric)
returns void
language plpgsql as $$
declare
    star numeric; sx numeric; sy numeric; expected numeric; score numeric; d numeric;
begin
    select star_premium into star from tc_settings where id = 1;
    select coalesce(sum(10000 * power(least(10000, rating * pick_mult) / 10000.0, 1 + star)), 0) into sx from tc_assets where id = any(p_x);
    select coalesce(sum(10000 * power(least(10000, rating * pick_mult) / 10000.0, 1 + star)), 0) into sy from tc_assets where id = any(p_y);
    if sx = 0 or sy = 0 then return; end if;

    expected := 1 / (1 + power(10, (sy - sx) / 3000.0));
    score := case p_outcome when 1 then 1 when 0 then 0.5 else 0 end;
    d := 160 * (score - expected) * p_weight;

    update tc_assets a set
        rating = greatest(100, least(10000, a.rating
            + d * (10000 * power(least(10000, a.rating * a.pick_mult) / 10000.0, 1 + star) / sx) / sqrt(1 + a.votes / 40.0) / a.pick_mult)),
        updated_at = now()
    where a.id = any(p_x);

    update tc_assets a set
        rating = greatest(100, least(10000, a.rating
            - d * (10000 * power(least(10000, a.rating * a.pick_mult) / 10000.0, 1 + star) / sy) / sqrt(1 + a.votes / 40.0) / a.pick_mult)),
        updated_at = now()
    where a.id = any(p_y);
end $$;

-- Sync from tc-seed.js. Items may carry pick_mult. A new team pick starts from the learned
-- rating of its generic year-and-round pick, so votes already cast are not thrown away.
create or replace function tc_sync_assets(p_assets jsonb, p_holdings jsonb) returns jsonb
language plpgsql as $$
declare added int; kept int; dropped int;
begin
    perform pg_advisory_xact_lock(hashtext('tc_sync'));

    select count(*) into kept from tc_assets a
        where a.id in (select x->>'id' from jsonb_array_elements(p_assets) x);

    insert into tc_assets (id, kind, name, position, nfl_team, age, pick_year, pick_round,
                           seed_value, rating, published_rating, rostered, pick_mult)
    select x->>'id', x->>'kind', x->>'name', x->>'position', x->>'nfl_team',
           nullif(x->>'age','')::numeric, nullif(x->>'pick_year','')::int, nullif(x->>'pick_round','')::int,
           (x->>'seed_value')::numeric,
           coalesce((select g.rating from tc_assets g
                      where x->>'kind' = 'pick'
                        and g.id = regexp_replace(x->>'id', '^(pick:[0-9]+:[0-9]+):[0-9]+$', '\1')
                        and g.id <> x->>'id'),
                    (x->>'seed_value')::numeric),
           least(10000, coalesce((select g.rating from tc_assets g
                      where x->>'kind' = 'pick'
                        and g.id = regexp_replace(x->>'id', '^(pick:[0-9]+:[0-9]+):[0-9]+$', '\1')
                        and g.id <> x->>'id'),
                    (x->>'seed_value')::numeric) * coalesce((x->>'pick_mult')::numeric, 1)),
           true, coalesce((x->>'pick_mult')::numeric, 1)
    from jsonb_array_elements(p_assets) x
    on conflict (id) do update set
        name = excluded.name,
        position = excluded.position,
        nfl_team = excluded.nfl_team,
        age = excluded.age,
        seed_value = excluded.seed_value,
        rostered = true,
        updated_at = now();
    added := jsonb_array_length(p_assets) - kept;

    -- only touch pick_mult when a slot projection moved, so quiet days do not bump the version
    if exists (
        select 1 from tc_assets a
        join jsonb_array_elements(p_assets) x on x->>'id' = a.id
        where x ? 'pick_mult' and a.pick_mult is distinct from (x->>'pick_mult')::numeric
    ) then
        update tc_assets a set pick_mult = (x->>'pick_mult')::numeric
        from jsonb_array_elements(p_assets) x
        where x->>'id' = a.id and x ? 'pick_mult' and a.pick_mult is distinct from (x->>'pick_mult')::numeric;
    end if;

    update tc_assets set rostered = false, updated_at = now()
        where rostered and id not in (select x->>'id' from jsonb_array_elements(p_assets) x);
    get diagnostics dropped = row_count;

    delete from tc_holdings where true;
    insert into tc_holdings (asset_id, team_id)
    select x->>'asset_id', (x->>'team_id')::uuid
    from jsonb_array_elements(p_holdings) x
    where exists (select 1 from tc_assets a where a.id = x->>'asset_id')
    on conflict (asset_id) do update set team_id = excluded.team_id;

    return jsonb_build_object('added', added, 'kept', kept, 'dropped', dropped,
                              'holdings', (select count(*) from tc_holdings));
end $$;

revoke all on function tc_sync_assets(jsonb, jsonb) from public, anon, authenticated;
revoke all on function tc_live_publish() from public, anon, authenticated;
