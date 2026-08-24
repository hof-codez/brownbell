-- 006-public-read-weekly-scores.sql
-- Adds public SELECT access for weekly_scores, needed by the League tab
-- (weekly and season-total standings). Same reasoning as prior migrations -
-- still no write access via the anon key anywhere. Run in the Supabase SQL
-- Editor after 005-duos-source-and-original.sql.

create policy "Public can view weekly scores"
    on weekly_scores for select
    using (true);
