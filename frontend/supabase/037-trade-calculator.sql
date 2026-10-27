-- 037-trade-calculator.sql
-- League trade value calculator (separate app, same Supabase project).
-- Additive only: creates tc_* tables and functions. Touches nothing that exists.
--
-- Access model matches the rest of Brown Bell: RLS on, no policies, everything goes
-- through Edge Functions with the service role.

-- ============================================================================
-- SETTINGS (single row)
-- ============================================================================
create table if not exists tc_settings (
    id int primary key default 1 check (id = 1),
    max_votes_per_day int not null default 5,
    vote_window_days int not null default 7,
    window_ends_at timestamptz not null default (now() + interval '7 days'),
    version int not null default 1,            -- bumps every time values are published
    star_premium numeric not null default 0.30, -- 0 = pure addition, higher = stars worth more
    pick_year_discount numeric not null default 0.92, -- seed only: each year out is worth this much less
    published_at timestamptz not null default now()
);
insert into tc_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================================
-- ASSETS (rostered players + generic picks, one table, one scale 0 to 10000)
-- ============================================================================
create table if not exists tc_assets (
    id text primary key,                 -- 'p:<sleeper_id>' or 'pick:<year>:<round>'
    kind text not null check (kind in ('player', 'pick')),
    name text not null,
    position text,                       -- QB/RB/WR/TE, null for picks
    nfl_team text,
    age numeric,
    pick_year int,
    pick_round int,
    seed_value numeric not null,         -- outside-value starting point
    rating numeric not null,             -- live rating, moved by votes, hidden until publish
    published_rating numeric not null,   -- what the app shows
    votes int not null default 0,        -- times this asset appeared in a counted ballot
    rostered boolean not null default true,
    updated_at timestamptz not null default now()
);
create index if not exists idx_tc_assets_rostered on tc_assets (rostered) where rostered;

-- Who holds which player right now (players only, so voters never rate their own).
create table if not exists tc_holdings (
    asset_id text primary key references tc_assets(id) on delete cascade,
    team_id uuid not null references teams(id) on delete cascade
);
create index if not exists idx_tc_holdings_team on tc_holdings (team_id);

-- ============================================================================
-- VOTES
-- ============================================================================
create table if not exists tc_votes (
    id bigint generated always as identity primary key,
    team_id uuid not null references teams(id) on delete cascade,
    keep_id text not null references tc_assets(id) on delete cascade,
    trade_id text not null references tc_assets(id) on delete cascade,
    cut_id text not null references tc_assets(id) on delete cascade,
    created_at timestamptz not null default now(),
    check (keep_id <> trade_id and keep_id <> cut_id and trade_id <> cut_id)
);
create index if not exists idx_tc_votes_team_day on tc_votes (team_id, created_at desc);

alter table tc_settings enable row level security;
alter table tc_assets enable row level security;
alter table tc_holdings enable row level security;
alter table tc_votes enable row level security;

-- ============================================================================
-- Elo style update. keep beats trade, keep beats cut, trade beats cut.
-- Bigger moves while an asset has few votes, smaller as it settles.
-- ============================================================================
create or replace function tc_apply_pair(winner text, loser text) returns void
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
    delta_w := kw * (1 - expected);
    delta_l := kl * (1 - expected);
    update tc_assets set rating = least(10000, rating + delta_w), updated_at = now() where id = winner;
    update tc_assets set rating = greatest(100, rating - delta_l), updated_at = now() where id = loser;
end $$;

-- Casts one ballot. Checks the daily cap and that no asset belongs to the voter.
-- Returns how many votes the team has left today (Arizona time, no daylight saving).
create or replace function tc_cast_vote(p_team uuid, p_keep text, p_trade text, p_cut text)
returns int
language plpgsql as $$
declare
    cap int;
    used int;
    day_start timestamptz;
    n_found int;
begin
    select max_votes_per_day into cap from tc_settings where id = 1;

    -- one vote at a time per team so the daily cap cannot be raced
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

    -- lock the three rows in a fixed order so two votes cannot deadlock
    perform 1 from tc_assets where id in (p_keep, p_trade, p_cut) order by id for update;

    insert into tc_votes (team_id, keep_id, trade_id, cut_id) values (p_team, p_keep, p_trade, p_cut);
    perform tc_apply_pair(p_keep, p_trade);
    perform tc_apply_pair(p_keep, p_cut);
    perform tc_apply_pair(p_trade, p_cut);
    update tc_assets set votes = votes + 1 where id in (p_keep, p_trade, p_cut);

    return cap - used - 1;
end $$;

create or replace function tc_votes_left(p_team uuid) returns int
language sql stable as $$
    select (select max_votes_per_day from tc_settings where id = 1) - count(*)::int
    from tc_votes
    where team_id = p_team
      and created_at >= date_trunc('day', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix';
$$;

-- Publishes the live ratings and starts the next voting window.
-- Safe to call any time. tc-values calls it when the window has closed.
create or replace function tc_publish(p_force boolean default false) returns int
language plpgsql as $$
declare v int;
begin
    perform pg_advisory_xact_lock(hashtext('tc_publish'));
    if not p_force and not exists (select 1 from tc_settings where id = 1 and now() >= window_ends_at) then
        select version into v from tc_settings where id = 1;
        return v;
    end if;
    update tc_assets set published_rating = rating where rostered;
    update tc_settings
        set version = version + 1,
            published_at = now(),
            window_ends_at = now() + make_interval(days => vote_window_days)
        where id = 1
        returning version into v;
    return v;
end $$;

-- Only the service role (Edge Functions) may call these.
revoke all on function tc_apply_pair(text, text) from public, anon, authenticated;
revoke all on function tc_cast_vote(uuid, text, text, text) from public, anon, authenticated;
revoke all on function tc_votes_left(uuid) from public, anon, authenticated;
revoke all on function tc_publish(boolean) from public, anon, authenticated;

-- ============================================================================
-- Seed sync. Called by tc-seed.js with the full current list of assets and holdings.
-- New assets start at their seed value. Existing assets keep their voted rating;
-- only the descriptive fields and the seed value are refreshed. Anything not in
-- the list is marked unrostered (hidden, but its history stays).
-- ============================================================================
create or replace function tc_sync_assets(p_assets jsonb, p_holdings jsonb) returns jsonb
language plpgsql as $$
declare added int; kept int; dropped int;
begin
    perform pg_advisory_xact_lock(hashtext('tc_sync'));

    select count(*) into kept from tc_assets a
        where a.id in (select x->>'id' from jsonb_array_elements(p_assets) x);

    insert into tc_assets (id, kind, name, position, nfl_team, age, pick_year, pick_round,
                           seed_value, rating, published_rating, rostered)
    select x->>'id', x->>'kind', x->>'name', x->>'position', x->>'nfl_team',
           nullif(x->>'age','')::numeric, nullif(x->>'pick_year','')::int, nullif(x->>'pick_round','')::int,
           (x->>'seed_value')::numeric, (x->>'seed_value')::numeric, (x->>'seed_value')::numeric, true
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
