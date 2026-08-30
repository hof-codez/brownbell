-- 020-team-accent-color.sql
-- Adds an owner-customizable accent color, applied to the team name text
-- and card border - a lighter personalization option alongside the
-- background image, for owners who want to make their card their own
-- without uploading a photo. Any hex value, chosen via a native color
-- picker - validated server-side in set-team-background regardless.
--
-- Run in the Supabase SQL Editor after 019-matchup-predictions.sql.

alter table teams add column accent_color text
    check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');
