-- Brown Bell / Next Up - Supabase schema
-- Fresh schema for the 2026 rebuild. Nothing here carries over 2025's data model -
-- it's built for what this season actually needs: owner self-serve subs, live
-- roster-drop detection, and a real frontend instead of a static JSON viewer.
--
-- Access model: RLS is enabled on every table with NO public policies. The anon/public
-- key can't read or write anything directly. All access goes through Supabase Edge
-- Functions using the service role key - this is where passcode/device-claim checks
-- happen before any read or write is allowed. Simpler and safer than modeling per-team
-- RLS policies against a passcode scheme Supabase Auth doesn't natively support.

-- ============================================================================
-- SEASONS - one row per season, so the schema doesn't need a hardcoded year anywhere
-- ============================================================================
create table seasons (
    id uuid primary key default gen_random_uuid(),
    year int not null unique,
    sleeper_league_id text not null,
    current_week int not null default 1,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- TEAMS - one row per Sleeper roster, per season (dynasty rosters persist, but the
-- Sleeper league_id itself changes every season, so teams are scoped per season)
-- ============================================================================
create table teams (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references seasons(id) on delete cascade,
    sleeper_roster_id text not null,
    sleeper_owner_id text not null,
    display_name text not null, -- Sleeper display name, pulled live at seed time
    created_at timestamptz not null default now(),
    unique (season_id, sleeper_roster_id)
);

-- ============================================================================
-- TEAM CLAIMS - the passcode + device-claim identity layer. A team is "claimed" once
-- a PIN is set; device_tokens lets a claimed device skip the PIN on return visits.
-- pin_hash is never compared client-side - only inside an edge function.
-- ============================================================================
create table team_claims (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null unique references teams(id) on delete cascade,
    pin_hash text not null,
    device_tokens jsonb not null default '[]'::jsonb, -- array of {token, label, added_at}
    claimed_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- DUOS - current QB/RB/WR pairing per team per award. This is the "starting lineup";
-- history of how it changed lives in substitutions, not here.
-- ============================================================================
create table duos (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    award_type text not null check (award_type in ('main', 'nextup')),
    player_index int not null check (player_index in (0, 1)),
    player_name text not null,
    player_position text not null,
    sleeper_player_id text,
    experience text, -- 'rookie' | 'sophomore' | null (main award doesn't use this)
    updated_at timestamptz not null default now(),
    unique (team_id, award_type, player_index)
);

-- ============================================================================
-- SUBSTITUTIONS - full history of every substitution, owner-picked or automated.
-- source distinguishes who made the call; active + end_week track current state.
-- ============================================================================
create table substitutions (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    award_type text not null check (award_type in ('main', 'nextup')),
    player_index int not null check (player_index in (0, 1)),
    original_name text not null,
    original_position text not null,
    substitute_name text,
    substitute_player_id text,
    substitute_position text,
    start_week int not null,
    end_week int,
    active boolean not null default true,
    source text not null check (source in ('owner', 'auto')),
    reason text,
    no_replacement_available boolean not null default false,
    created_at timestamptz not null default now()
);

create index idx_substitutions_team_week on substitutions (team_id, start_week);
create index idx_substitutions_active on substitutions (team_id, award_type, player_index) where active = true;

-- ============================================================================
-- WEEKLY SCORES - one row per player-week, per team/award
-- ============================================================================
create table weekly_scores (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    award_type text not null check (award_type in ('main', 'nextup')),
    week int not null,
    sleeper_player_id text not null,
    points numeric not null default 0,
    updated_at timestamptz not null default now(),
    unique (team_id, award_type, week, sleeper_player_id)
);

-- ============================================================================
-- SCHEDULE SNAPSHOTS / CHANGES - the flex-detection feature added this season
-- ============================================================================
create table schedule_snapshots (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references seasons(id) on delete cascade,
    week int not null,
    teams jsonb not null, -- { TEAM_ABBR: { date, opponent, status, international, venue } }
    captured_at timestamptz not null default now(),
    unique (season_id, week)
);

create table schedule_changes (
    id uuid primary key default gen_random_uuid(),
    season_id uuid not null references seasons(id) on delete cascade,
    week int not null,
    changes jsonb not null default '[]'::jsonb,
    detected_at timestamptz not null default now()
);

-- ============================================================================
-- SEASON ARCHIVE - frozen reference copy of a completed season's final data.
-- Not queried by the app; exists purely so old seasons stay inspectable.
-- ============================================================================
create table season_archive (
    id uuid primary key default gen_random_uuid(),
    year int not null unique,
    raw_data jsonb not null, -- the final brown-bell-data.json as it stood at season end
    archived_at timestamptz not null default now()
);

-- ============================================================================
-- MANAGER CHANGES - mid-season ownership transfers (a team gets handed to a new
-- manager). Standalone state, not derivable from anything else.
-- ============================================================================
create table manager_changes (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    previous_manager text not null,
    change_week int not null,
    reason text,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- ROSTER CHANGES - trade tracking (a duo player was traded away mid-season, so
-- historical scoring needs to reference the pre-trade roster for earlier weeks).
-- ============================================================================
create table roster_changes (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    award_type text not null check (award_type in ('main', 'nextup')),
    player_index int not null check (player_index in (0, 1)),
    change_week int not null,
    reason text,
    created_at timestamptz not null default now()
);

-- Note: there is no separate "manual subs used" table - whether a team has used
-- their one owner-initiated override for an award is derived by checking whether
-- any substitutions row exists for that team/award with source = 'owner', rather
-- than tracked as separate redundant state.

-- ============================================================================
-- RLS - enabled everywhere, no policies. All access via edge functions (service role).
-- ============================================================================
alter table seasons enable row level security;
alter table teams enable row level security;
alter table team_claims enable row level security;
alter table duos enable row level security;
alter table substitutions enable row level security;
alter table weekly_scores enable row level security;
alter table schedule_snapshots enable row level security;
alter table schedule_changes enable row level security;
alter table season_archive enable row level security;
alter table manager_changes enable row level security;
alter table roster_changes enable row level security;
