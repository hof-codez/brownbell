-- 033-standby-substitutes.sql
-- Solves a real, structural gap: the normal auto-sub logic requires a
-- replacement's own game to kick off at the same time or later than the
-- player they're replacing (see selectAutoReplacement in
-- update-standings.js) - a fairness rule preventing someone from swapping
-- in a player whose outcome is already known. But when a duo member's
-- game IS the week's Monday Night game, nothing else that week kicks off
-- later, so if they're ruled out, there is structurally no eligible
-- candidate at all under that rule.
--
-- The fix: let an owner pre-commit a "standby" player in advance, for a
-- specific week, BEFORE either the standby's own game or the Monday
-- Night player's game has started - so the choice is made blind, same
-- fairness principle the kickoff-time rule already enforces, just
-- applied ahead of time instead of in the moment. If the Monday Night
-- player ends up ruled out, this standby activates automatically, no
-- matter that their own game already happened earlier in the week.
--
-- Deliberately named "standby" throughout the app (never "auto-sub" or
-- "substitute" alone) to stay clearly distinct from the existing,
-- unrelated auto-sub feature this is meant to cover a gap in.

create table if not exists standby_substitutes (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references teams(id) on delete cascade,
    award_type text not null check (award_type in ('main', 'nextup', 'boom')),
    player_index smallint not null check (player_index in (0, 1)),
    -- Week-specific by design (per explicit request) - a standby set for
    -- one week has no bearing on any other week, even for the same slot.
    week integer not null,
    standby_sleeper_player_id text not null,
    standby_player_name text not null,
    standby_player_position text not null,
    -- The Monday Night player this standby is designated to cover FOR,
    -- captured at set-time. Lets the activation logic in
    -- update-standings.js confirm the standby is still actually paired
    -- with the same player it was set up to cover - if the slot's
    -- occupant changed since (a manual owner swap), this standby no
    -- longer applies to whoever is in the slot now and is left unused
    -- rather than activated for the wrong player.
    covers_sleeper_player_id text not null,
    -- Set true the moment update-standings.js actually activates this
    -- standby - never reused or reconsidered again afterward, even if
    -- somehow re-evaluated on a later run.
    consumed boolean not null default false,
    created_at timestamptz not null default now(),
    -- At most one standby per team/award/slot/week - setting a new one
    -- before the lock replaces the prior choice (upsert), it doesn't
    -- create a second row.
    unique (team_id, award_type, player_index, week)
);

alter table standby_substitutes enable row level security;

-- Public, read-only - matches every other table's RLS policy in this
-- app. All writes go through the service role key (update-standings.js
-- activating one, or the set-standby Edge Function persisting an
-- owner's choice), which bypasses RLS entirely - there is no public
-- insert/update policy here on purpose.
create policy "Public can view standby substitutes"
    on standby_substitutes for select
    using (true);
