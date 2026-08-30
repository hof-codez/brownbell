-- 018-team-backgrounds.sql
-- Adds owner-customizable team card backgrounds: an uploaded image plus a
-- configurable opacity. Teams tab only for now - not reflected anywhere
-- else in the app.
--
-- The bucket is PUBLIC (readable by anyone with the URL, no auth required)
-- since this app has no Supabase Auth to key signed-URL access off of, and
-- every team's card is visible to every viewer on the Teams tab anyway -
-- there's nothing here that needs to be gated per-viewer. WRITES still go
-- through the set-team-background Edge Function, which validates the
-- device token before using the service-role key to upload on the owner's
-- behalf - the bucket being public only affects reads, never writes.
--
-- file_size_limit and allowed_mime_types are a second line of defense on
-- top of the Edge Function's own validation, not a replacement for it.
--
-- Run in the Supabase SQL Editor after 017-season-of-boom-award.sql.

alter table teams add column background_image_url text;
alter table teams add column background_opacity numeric not null default 0.25
    check (background_opacity >= 0 and background_opacity <= 1);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-backgrounds', 'team-backgrounds', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
