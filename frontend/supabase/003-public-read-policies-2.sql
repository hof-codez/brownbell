-- 003-public-read-policies-2.sql
-- Adds public SELECT access for two more tables the frontend now needs.
-- Same reasoning as 002: still no write access via the anon key anywhere -
-- only these two additional read-only grants. Run this in the Supabase SQL
-- Editor after 002-public-read-policies.sql.

create policy "Public can view schedule snapshots"
    on schedule_snapshots for select
    using (true);

create policy "Public can view substitutions"
    on substitutions for select
    using (true);
