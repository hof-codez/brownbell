-- 047-bump-on-asset-changes.sql
-- New or dropped assets (players or picks) must reach cached clients too: bump the version.
drop trigger if exists tc_assets_bump_ins on tc_assets;
create trigger tc_assets_bump_ins after insert on tc_assets for each statement execute function tc_bump_version();
drop trigger if exists tc_assets_bump_rostered on tc_assets;
create trigger tc_assets_bump_rostered after update of rostered on tc_assets for each statement execute function tc_bump_version();
