-- 002-public-read-policies.sql
-- Adds public SELECT access for the read-only frontend (viewing teams/duos).
-- Deliberately does NOT add any INSERT/UPDATE/DELETE policies - writing duos
-- is still locked to the service role only, until the passcode + device-claim
-- system exists to gate who can write what. Run this in the Supabase SQL
-- Editor after schema.sql.

create policy "Public can view seasons"
    on seasons for select
    using (true);

create policy "Public can view teams"
    on teams for select
    using (true);

create policy "Public can view duos"
    on duos for select
    using (true);

-- Explicitly NOT adding a policy for team_claims - that table (passcodes,
-- device tokens) must never be readable by the anon key, now or later.
